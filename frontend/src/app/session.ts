import { ApiError, configureAuth, publicApi } from '../shared/api/client';
import type { AccessResponse, User } from '../shared/api/types';

interface Snapshot { user: User | null; loading: boolean; error: unknown }
let snapshot: Snapshot = { user: null, loading: true, error: null };
let accessToken: string | null = null;
let expiresAt = 0;
let generation = 0;
let refreshing: Promise<string | null> | null = null;
let restoring: Promise<void> | null = null;
let started = false;
let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function publish(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); }
function clear(loading = false) {
  generation++;
  accessToken = null;
  expiresAt = 0;
  publish({ user: null, loading, error: null });
}
function lock<T>(action: () => Promise<T>): Promise<T> {
  // The refresh cookie is shared by tabs. A process-local promise alone cannot prevent replay.
  if (!navigator.locks) return Promise.reject(new Error('Use a current browser over HTTPS, or localhost for local development. Browser session coordination is unavailable.'));
  return navigator.locks.request('splitnest-browser-session', action);
}
async function browserAction<T>(action: string, body?: unknown, bearer?: string | null): Promise<T> {
  // Read CSRF immediately under the same cross-tab lock: another tab may have initialized its cookie.
  const csrf = await publicApi<{ token: string; headerName: string }>('/browser-auth/csrf');
  return publicApi<T>(`/browser-auth/${action}`, {
    method: 'POST',
    headers: { [csrf.headerName]: csrf.token, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function accept(response: AccessResponse, expectedGeneration: number): Promise<string> {
  const user = await publicApi<User>('/users/me', { headers: { Authorization: `Bearer ${response.accessToken}` } });
  // A delayed profile response must never revive an account after another tab signed out.
  if (expectedGeneration !== generation) throw new DOMException('Session changed', 'AbortError');
  if (snapshot.user && snapshot.user.id !== user.id) generation++;
  accessToken = response.accessToken;
  expiresAt = Date.now() + response.expiresIn * 1000;
  publish({ user, loading: false, error: null });
  return response.accessToken;
}
async function refreshUnderLock(): Promise<string | null> {
  const expectedGeneration = generation;
  try { return await accept(await browserAction<AccessResponse>('refresh'), expectedGeneration); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      if (expectedGeneration === generation) clear();
      return null;
    }
    throw error;
  }
}
export function refreshSession(): Promise<string | null> {
  if (!refreshing) refreshing = lock(refreshUnderLock).finally(() => { refreshing = null; });
  return refreshing;
}
export function restoreSession(): Promise<void> {
  if (!restoring) {
    const expectedGeneration = generation;
    restoring = refreshSession().then(() => undefined).catch(error => {
      if (expectedGeneration === generation && !(error instanceof DOMException && error.name === 'AbortError')) {
        publish({ user: null, loading: false, error });
      }
    }).finally(() => { restoring = null; });
  }
  return restoring;
}
export async function signIn(email: string, password: string): Promise<void> {
  await lock(async () => {
    const response = await browserAction<AccessResponse>('login', { email, password });
    clear(true);
    const expectedGeneration = generation;
    try { await accept(response, expectedGeneration); }
    catch (error) { if (expectedGeneration === generation) clear(); throw error; }
    finally {
      // Login changed the shared cookie even if loading the profile was interrupted.
      channel?.postMessage({ type: 'changed' });
    }
  });
}
export async function register(displayName: string, email: string, password: string): Promise<void> {
  await publicApi<User>('/auth/register', { method: 'POST', body: JSON.stringify({ displayName, email, password }) });
  try { await signIn(email, password); }
  catch (error) {
    const detail = error instanceof Error ? error.message : 'Please sign in to continue.';
    throw new Error(`Your account was created. ${detail}`);
  }
}
export async function signOut(): Promise<void> {
  await lock(async () => {
    try {
      const token = accessToken && expiresAt > Date.now() + 5_000 ? accessToken : await refreshUnderLock();
      if (token) await browserAction('logout', undefined, token);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
    clear();
    channel?.postMessage({ type: 'signed-out' });
  });
}
export function startSession() {
  if (started) return;
  started = true;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('splitnest-session');
    channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'signed-out') clear();
      if (event.data?.type === 'changed') {
        clear(true);
        const expectedGeneration = generation;
        // Let an invalidated in-flight refresh finish before reading the new shared cookie.
        void Promise.allSettled([restoring, refreshing]).then(() => {
          if (expectedGeneration === generation && snapshot.loading) void restoreSession();
        });
      }
    };
  }
  void restoreSession();
}
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSnapshot = () => snapshot;

configureAuth({
  accessToken: () => accessToken,
  generation: () => generation,
  refresh: refreshSession,
  expired: () => clear(),
});
