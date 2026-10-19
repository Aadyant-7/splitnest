import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessResponse, User } from '../shared/api/types';

const mocks = vi.hoisted(() => ({ publicApi: vi.fn(), configureAuth: vi.fn() }));
vi.mock('../shared/api/client', async () => ({
  ...await vi.importActual<typeof import('../shared/api/client')>('../shared/api/client'),
  publicApi: mocks.publicApi, configureAuth: mocks.configureAuth,
}));

type AuthHandlers = Parameters<typeof import('../shared/api/client').configureAuth>[0];
const alice: User = { id: 'alice-id', email: 'alice@example.test', displayName: 'Alice', createdAt: '2026-10-19T00:00:00Z' };
const bob: User = { ...alice, id: 'bob-id', email: 'bob@example.test', displayName: 'Bob' };
const access: AccessResponse = { accessToken: 'memory-only-access', tokenType: 'Bearer', expiresIn: 900 };
const csrf = { token: 'fresh-masked-csrf', headerName: 'X-CSRF-TOKEN' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<{ type?: string }>) => void) | null = null;
  postMessage = vi.fn();
  constructor(readonly name: string) { FakeBroadcastChannel.instances.push(this); }
  receive(type: string) { this.onmessage?.({ data: { type } } as MessageEvent<{ type?: string }>); }
}

describe('browser session coordination', () => {
  let session: typeof import('./session');
  let ApiError: typeof import('../shared/api/client').ApiError;
  let handlers: AuthHandlers;
  let depth: number;
  let maxDepth: number;
  let requestLock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    FakeBroadcastChannel.instances = [];
    depth = 0;
    maxDepth = 0;
    let tail: Promise<unknown> = Promise.resolve();
    requestLock = vi.fn(<T,>(_name: string, action: () => Promise<T>): Promise<T> => {
      const next = tail.then(async () => {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
        try { return await action(); } finally { depth--; }
      });
      tail = next.then(() => undefined, () => undefined);
      return next;
    });
    vi.stubGlobal('navigator', { locks: { request: requestLock } });
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    mocks.publicApi.mockImplementation(async (path: string) => {
      expect(depth).toBe(1);
      if (path === '/browser-auth/csrf') return csrf;
      if (path === '/browser-auth/refresh' || path === '/browser-auth/login') return access;
      if (path === '/users/me') return alice;
      if (path === '/browser-auth/logout') return undefined;
      throw new Error(`Unexpected request: ${path}`);
    });
    ({ ApiError } = await import('../shared/api/client'));
    session = await import('./session');
    handlers = mocks.configureAuth.mock.calls.at(-1)![0] as AuthHandlers;
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function startSignedIn() {
    session.startSession();
    await session.restoreSession();
    expect(session.getSnapshot().user).toEqual(alice);
    mocks.publicApi.mockClear();
    requestLock.mockClear();
  }

  it('restores once, reads CSRF inside the session lock, and stores only an access token in memory', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    session.startSession();
    session.startSession();
    const first = session.restoreSession();
    expect(session.restoreSession()).toBe(first);
    await first;
    expect(requestLock).toHaveBeenCalledTimes(1);
    expect(requestLock).toHaveBeenCalledWith('splitnest-browser-session', expect.any(Function));
    expect(mocks.publicApi.mock.calls.map(([path]) => path)).toEqual(['/browser-auth/csrf', '/browser-auth/refresh', '/users/me']);
    expect(mocks.publicApi).toHaveBeenNthCalledWith(2, '/browser-auth/refresh', {
      method: 'POST', headers: { 'X-CSRF-TOKEN': csrf.token },
    });
    expect(mocks.publicApi).toHaveBeenNthCalledWith(3, '/users/me', { headers: { Authorization: `Bearer ${access.accessToken}` } });
    expect(session.getSnapshot()).toEqual({ user: alice, loading: false, error: null });
    expect(handlers.accessToken()).toBe(access.accessToken);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(FakeBroadcastChannel.instances).toHaveLength(1);
    expect(FakeBroadcastChannel.instances[0].postMessage).not.toHaveBeenCalled();
  });

  it('coalesces simultaneous refresh callers into one rotation', async () => {
    const rotation = deferred<AccessResponse>();
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      if (path === '/browser-auth/refresh') return rotation.promise;
      if (path === '/users/me') return alice;
      throw new Error(path);
    });
    const first = session.refreshSession();
    const second = session.refreshSession();
    expect(second).toBe(first);
    await vi.waitFor(() => expect(mocks.publicApi).toHaveBeenCalledWith('/browser-auth/refresh', expect.anything()));
    rotation.resolve(access);
    await expect(first).resolves.toBe(access.accessToken);
    expect(requestLock).toHaveBeenCalledTimes(1);
    expect(mocks.publicApi.mock.calls.filter(([path]) => path === '/browser-auth/refresh')).toHaveLength(1);
  });

  it('serializes refreshes from separate session module instances through the shared browser lock', async () => {
    const firstRotation = deferred<AccessResponse>();
    let rotations = 0;
    mocks.publicApi.mockImplementation(async (path: string) => {
      expect(depth).toBe(1);
      if (path === '/browser-auth/csrf') return csrf;
      if (path === '/browser-auth/refresh') return ++rotations === 1 ? firstRotation.promise : access;
      if (path === '/users/me') return alice;
      throw new Error(path);
    });
    const first = session.refreshSession();
    await vi.waitFor(() => expect(rotations).toBe(1));
    vi.resetModules();
    const secondTab = await import('./session');
    const second = secondTab.refreshSession();
    await Promise.resolve();
    expect(rotations).toBe(1);
    firstRotation.resolve(access);
    await Promise.all([first, second]);
    expect(rotations).toBe(2);
    expect(maxDepth).toBe(1);
    expect(secondTab.getSnapshot().user).toEqual(alice);
  });

  it('treats an absent or expired refresh cookie as an anonymous session', async () => {
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      throw new ApiError(401, 'Refresh expired.');
    });
    await session.restoreSession();
    expect(session.getSnapshot()).toEqual({ user: null, loading: false, error: null });
    expect(handlers.accessToken()).toBeNull();
  });

  it('exposes an unavailable restoration and allows a later retry', async () => {
    const failure = new ApiError(503, 'Temporarily unavailable.');
    mocks.publicApi.mockRejectedValueOnce(failure);
    await session.restoreSession();
    expect(session.getSnapshot()).toEqual({ user: null, loading: false, error: failure });
    expect(handlers.accessToken()).toBeNull();
    await session.restoreSession();
    expect(session.getSnapshot().user).toEqual(alice);
  });

  it('logs in with fresh CSRF and broadcasts a change without credentials or tokens', async () => {
    await startSignedIn();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    await session.signIn('bob@example.test', 'typed-password');
    expect(mocks.publicApi).toHaveBeenNthCalledWith(1, '/browser-auth/csrf');
    expect(mocks.publicApi).toHaveBeenNthCalledWith(2, '/browser-auth/login', {
      method: 'POST', headers: { 'X-CSRF-TOKEN': csrf.token }, body: JSON.stringify({ email: 'bob@example.test', password: 'typed-password' }),
    });
    expect(FakeBroadcastChannel.instances[0].postMessage.mock.calls).toEqual([[{ type: 'changed' }]]);
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('does not discard an existing session when login is rejected before its cookie changes', async () => {
    await startSignedIn();
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      throw new ApiError(401, 'Invalid credentials.');
    });
    await expect(session.signIn('bob@example.test', 'wrong-password')).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot().user).toEqual(alice);
    expect(handlers.accessToken()).toBe(access.accessToken);
    expect(FakeBroadcastChannel.instances[0].postMessage).not.toHaveBeenCalled();
  });

  it('clears loading and the partial access token if login succeeds but loading its profile fails', async () => {
    await startSignedIn();
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      if (path === '/browser-auth/login') return access;
      throw new ApiError(503, 'Profile unavailable.');
    });
    await expect(session.signIn('alice@example.test', 'typed-password')).rejects.toMatchObject({ status: 503 });
    expect(session.getSnapshot()).toEqual({ user: null, loading: false, error: null });
    expect(handlers.accessToken()).toBeNull();
    expect(FakeBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith({ type: 'changed' });
  });

  it('tells the caller an account was created if subsequent automatic sign-in fails', async () => {
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/auth/register') { expect(depth).toBe(0); return alice; }
      if (path === '/browser-auth/csrf') return csrf;
      throw new ApiError(429, 'Please wait before trying again.');
    });
    await expect(session.register('Alice', 'alice@example.test', 'typed-password')).rejects.toThrow('Your account was created. Please wait before trying again.');
    expect(mocks.publicApi).toHaveBeenNthCalledWith(1, '/auth/register', {
      method: 'POST', body: JSON.stringify({ displayName: 'Alice', email: 'alice@example.test', password: 'typed-password' }),
    });
  });

  it('logs out with the current bearer and CSRF, then clears memory and informs other tabs', async () => {
    await startSignedIn();
    const before = handlers.generation();
    await session.signOut();
    expect(mocks.publicApi.mock.calls.map(([path]) => path)).toEqual(['/browser-auth/csrf', '/browser-auth/logout']);
    expect(mocks.publicApi).toHaveBeenLastCalledWith('/browser-auth/logout', {
      method: 'POST', headers: { 'X-CSRF-TOKEN': csrf.token, Authorization: `Bearer ${access.accessToken}` },
    });
    expect(session.getSnapshot()).toEqual({ user: null, loading: false, error: null });
    expect(handlers.accessToken()).toBeNull();
    expect(handlers.generation()).toBeGreaterThan(before);
    expect(FakeBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith({ type: 'signed-out' });
  });

  it('refreshes an almost-expired bearer inside the existing logout lock without a nested lock', async () => {
    mocks.publicApi.mockImplementation(async (path: string) => {
      expect(depth).toBe(1);
      if (path === '/browser-auth/csrf') return csrf;
      if (path === '/browser-auth/refresh') return { ...access, expiresIn: 1 };
      if (path === '/users/me') return alice;
      if (path === '/browser-auth/logout') return undefined;
      throw new Error(path);
    });
    await startSignedIn();
    await session.signOut();
    expect(requestLock).toHaveBeenCalledTimes(1);
    expect(maxDepth).toBe(1);
    expect(mocks.publicApi.mock.calls.map(([path]) => path)).toEqual([
      '/browser-auth/csrf', '/browser-auth/refresh', '/users/me', '/browser-auth/csrf', '/browser-auth/logout',
    ]);
    expect(session.getSnapshot().user).toBeNull();
  });

  it('retains the current session when logout could not reach the server so the user can retry', async () => {
    await startSignedIn();
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      throw new ApiError(503, 'Try logging out again.');
    });
    await expect(session.signOut()).rejects.toMatchObject({ status: 503 });
    expect(session.getSnapshot().user).toEqual(alice);
    expect(handlers.accessToken()).toBe(access.accessToken);
    expect(FakeBroadcastChannel.instances[0].postMessage).not.toHaveBeenCalled();
  });

  it('clears a session if logout confirms that it is already expired', async () => {
    await startSignedIn();
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      throw new ApiError(401, 'Already expired.');
    });
    await session.signOut();
    expect(session.getSnapshot().user).toBeNull();
    expect(handlers.accessToken()).toBeNull();
    expect(FakeBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith({ type: 'signed-out' });
  });

  it('fails visibly before sending auth requests if cross-tab locking is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    await session.restoreSession();
    expect(session.getSnapshot()).toMatchObject({ user: null, loading: false, error: expect.any(Error) });
    expect((session.getSnapshot().error as Error).message).toContain('coordination is unavailable');
    expect(mocks.publicApi).not.toHaveBeenCalled();
  });

  it('does not resurrect a previous user when another tab signs out during profile restoration', async () => {
    const profile = deferred<User>();
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      if (path === '/browser-auth/refresh') return access;
      if (path === '/users/me') return profile.promise;
      throw new Error(path);
    });
    session.startSession();
    const restoring = session.restoreSession();
    await vi.waitFor(() => expect(mocks.publicApi).toHaveBeenCalledWith('/users/me', expect.anything()));
    FakeBroadcastChannel.instances[0].receive('signed-out');
    profile.resolve(alice);
    await restoring;
    expect(session.getSnapshot()).toEqual({ user: null, loading: false, error: null });
    expect(handlers.accessToken()).toBeNull();
  });

  it('restores the new shared-cookie account after a change arrives during an older restoration', async () => {
    const oldProfile = deferred<User>();
    let profiles = 0;
    let rotations = 0;
    mocks.publicApi.mockImplementation(async (path: string) => {
      if (path === '/browser-auth/csrf') return csrf;
      if (path === '/browser-auth/refresh') return { ...access, accessToken: ++rotations === 1 ? 'alice-access' : 'bob-access' };
      if (path === '/users/me') return ++profiles === 1 ? oldProfile.promise : bob;
      throw new Error(path);
    });
    session.startSession();
    const restoring = session.restoreSession();
    await vi.waitFor(() => expect(profiles).toBe(1));
    FakeBroadcastChannel.instances[0].receive('changed');
    oldProfile.resolve(alice);
    await restoring;
    await vi.waitFor(() => expect(session.getSnapshot().user).toEqual(bob));
    expect(rotations).toBe(2);
    expect(handlers.accessToken()).toBe('bob-access');
  });
});
