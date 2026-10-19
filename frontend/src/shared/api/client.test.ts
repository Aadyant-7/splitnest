import { beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});

describe('API client', () => {
  let client: typeof import('./client');
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let generation: number;
  let refresh: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  let expired: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    client = await import('./client');
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    generation = 0;
    refresh = vi.fn<() => Promise<string | null>>().mockResolvedValue('new-access');
    expired = vi.fn();
    client.configureAuth({ accessToken: () => 'old-access', generation: () => generation, refresh, expired });
  });

  it('sends same-origin JSON without injecting a bearer token into public requests', async () => {
    fetchMock.mockResolvedValue(json({ token: 'csrf-value' }));
    await expect(client.publicApi('/browser-auth/csrf', {
      method: 'POST', body: '{"email":"alice@example.test"}', credentials: 'include', cache: 'force-cache',
    })).resolves.toEqual({ token: 'csrf-value' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/browser-auth/csrf');
    expect(init).toMatchObject({ credentials: 'same-origin', cache: 'no-store', method: 'POST' });
    const headers = new Headers(init?.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
  });

  it('preserves an explicit public bearer header without mutating caller headers', async () => {
    const headers = new Headers({ Authorization: 'Bearer logout-access', 'X-CSRF-TOKEN': 'csrf' });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client.publicApi('/browser-auth/logout', { method: 'POST', headers })).resolves.toBeUndefined();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer logout-access');
    expect(headers.has('Accept')).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns ProblemDetail field errors and a bounded numeric Retry-After', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Too many attempts.', errors: { email: 'Invalid email.' } }, 429,
      { 'Retry-After': '32' }));
    await expect(client.api('/auth/login')).rejects.toMatchObject({
      name: 'ApiError', status: 429, message: 'Too many attempts.', errors: { email: 'Invalid email.' }, retryAfter: 32,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(['not-a-number', undefined])('handles missing or invalid Retry-After (%s)', async retry => {
    fetchMock.mockResolvedValue(json({ detail: 'Unavailable.' }, 503, retry ? { 'Retry-After': retry } : {}));
    await expect(client.api('/groups')).rejects.toMatchObject({ status: 503, retryAfter: null });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('falls back to a useful error when a proxy sends a non-JSON response', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Unavailable</html>', { status: 502 }));
    await expect(client.api('/groups')).rejects.toMatchObject({ status: 502, detail: 'Request failed (502). Please try again.' });
  });

  it('retries an authenticated JSON mutation once with the same body and signal', async () => {
    const controller = new AbortController();
    const body = JSON.stringify({ name: 'Our apartment' });
    fetchMock.mockResolvedValueOnce(json({ detail: 'Expired.' }, 401)).mockResolvedValueOnce(json({ id: 'group-id' }, 201));
    await expect(client.api('/groups', { method: 'POST', body, signal: controller.signal })).resolves.toEqual({ id: 'group-id' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ method: 'POST', body, signal: controller.signal, credentials: 'same-origin' });
    }
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer old-access');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer new-access');
  });

  it('reuses a multipart body after refresh without setting a JSON or boundary header', async () => {
    const body = new FormData();
    body.append('file', new File(['date,description,amount\n2026-10-19,Food,2.00'], 'statement.csv', { type: 'text/csv' }));
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ id: 'import-id' }, 202));
    await expect(client.api('/groups/group-id/imports', { method: 'POST', body })).resolves.toEqual({ id: 'import-id' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.body).toBe(body);
      expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    }
  });

  it('stops after a second 401 instead of looping or replaying a mutation repeatedly', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Expired.' }, 401)).mockResolvedValueOnce(json({ detail: 'Rejected again.' }, 401));
    await expect(client.api('/groups', { method: 'POST', body: '{"name":"Apartment"}' })).rejects.toMatchObject({ status: 401, detail: 'Rejected again.' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('expires the session when refresh confirms that no session remains', async () => {
    refresh.mockResolvedValue(null);
    fetchMock.mockResolvedValue(json({ detail: 'Sign in again.' }, 401));
    await expect(client.api('/groups')).rejects.toMatchObject({ status: 401, detail: 'Sign in again.' });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send public authentication failures through refresh recursively', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Refresh expired.' }, 401));
    await expect(client.publicApi('/browser-auth/refresh', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it('discards a completed response when logout or an account change occurred in flight', async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const pending = client.api('/groups');
    generation++;
    response.resolve(json([{ id: 'previous-account-private-group' }]));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', message: 'Session changed' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh a stale account after an in-flight request returns 401', async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const pending = client.api('/groups');
    generation++;
    response.resolve(json({}, 401));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not replay a request when the account changed while refresh was pending', async () => {
    const token = deferred<string | null>();
    refresh.mockReturnValue(token.promise);
    fetchMock.mockResolvedValue(json({}, 401));
    const pending = client.api('/groups');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    generation++;
    token.resolve('another-account-access');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates cancellation and network failures without attempting authentication', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError')).mockRejectedValueOnce(new TypeError('Network unavailable'));
    await expect(client.api('/groups')).rejects.toMatchObject({ name: 'AbortError' });
    await expect(client.api('/groups')).rejects.toThrow('Network unavailable');
    expect(refresh).not.toHaveBeenCalled();
  });
});
