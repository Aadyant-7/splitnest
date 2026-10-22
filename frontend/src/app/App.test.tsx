import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const session = vi.hoisted(() => ({
  user: { id: 'user-1', displayName: 'Alex Morgan' } as { id: string; displayName: string } | null,
  loading: false,
  logout: vi.fn(),
}));
vi.mock('./SessionContext', () => ({ useSession: () => session }));
vi.mock('../features/groups/GroupsPage', () => ({ GroupsPage: () => <h1>Your groups</h1> }));
vi.mock('../features/groups/GroupPage', () => ({ GroupPage: () => <h1>Group workspace</h1> }));
vi.mock('../features/auth/AuthPage', () => ({ AuthPage: () => <h1>Sign in</h1> }));

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 'user-1', displayName: 'Alex Morgan' };
  session.loading = false;
  window.history.replaceState({}, '', '/app/groups');
});

describe('application shell', () => {
  it('retains the current account and allows a logout retry after a server failure', async () => {
    session.logout.mockRejectedValueOnce(new Error('Service temporarily unavailable'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service temporarily unavailable');
    expect(screen.getByText('Alex Morgan')).toBeVisible();
    expect(screen.getByRole('link', { name: 'My groups' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(session.logout).toHaveBeenCalledTimes(2));
  });
  it('preserves the requested workspace when redirecting a signed-out user', () => {
    session.user = null;
    window.history.replaceState({}, '', '/app/groups/11111111-1111-4111-8111-111111111111');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/app/groups/11111111-1111-4111-8111-111111111111');
  });
});
