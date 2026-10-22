import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error || error instanceof DOMException && error.name === 'AbortError') return null;
  const detail = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  return <div className="notice error" role="alert"><strong>Action unsuccessful</strong><p>{detail}</p>
    {error instanceof ApiError && Object.keys(error.errors).length > 0 && <ul>{Object.entries(error.errors).map(([field, message]) =>
      <li key={field}>{field}: {message}</li>)}</ul>}
    {error instanceof ApiError && error.retryAfter !== null && <p>Try again in {error.retryAfter} seconds.</p>}
  </div>;
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3>{children && <div className="muted">{children}</div>}</div>;
}
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}
