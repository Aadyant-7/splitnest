import { parseApiJson } from './json';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly errors: Record<string, string> = {},
    readonly retryAfter: number | null = null,
  ) { super(detail); this.name = 'ApiError'; }
}

interface AuthHandlers {
  accessToken: () => string | null;
  generation: () => number;
  refresh: () => Promise<string | null>;
  expired: () => void;
}
let auth: AuthHandlers | null = null;
export function configureAuth(handlers: AuthHandlers) { auth = handlers; }

async function request<T>(path: string, init: RequestInit, token: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    const retry = Number(response.headers.get('Retry-After'));
    throw new ApiError(response.status, problem.detail ?? `Request failed (${response.status}). Please try again.`,
      problem.errors ?? {}, response.headers.has('Retry-After') && Number.isFinite(retry) ? Math.max(0, retry) : null);
  }
  return response.status === 204 ? undefined as T : parseApiJson(await response.text()) as T;
}

export function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, null);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const generation = auth?.generation();
  const assertCurrent = () => {
    if (generation !== auth?.generation()) throw new DOMException('Session changed', 'AbortError');
  };
  try {
    const result = await request<T>(path, init, auth?.accessToken() ?? null);
    assertCurrent();
    return result;
  } catch (error) {
    assertCurrent();
    if (!(error instanceof ApiError) || error.status !== 401 || !auth) throw error;
    const token = await auth.refresh();
    assertCurrent();
    if (!token) { auth.expired(); throw error; }
    // Authentication rejected the first request before business logic ran. Retry only once.
    const result = await request<T>(path, init, token);
    assertCurrent();
    return result;
  }
}
