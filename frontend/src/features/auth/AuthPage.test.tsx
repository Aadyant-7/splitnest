import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import { AuthPage } from './AuthPage';

const session = vi.hoisted(() => ({
  user: null as null | { id: string }, loading: false, error: null as unknown,
  login: vi.fn(), register: vi.fn(),
}));
vi.mock('../../app/SessionContext', () => ({ useSession: () => session }));
function page(mode: 'login' | 'register' = 'login', path = '/login') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<AuthPage mode={mode} />} />
    <Route path="/app/groups" element={<p>My groups destination</p>} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); session.user = null; session.loading = false; session.error = null; });

describe('authentication forms', () => {
  it('submits registration fields and preserves server validation feedback', async () => {
    session.register.mockRejectedValueOnce(new ApiError(409, 'Email is already registered'));
    page('register');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: ' Alex ' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alex@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'PlacementDemo123!' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }));
    await waitFor(() => expect(session.register).toHaveBeenCalledWith('Alex', 'alex@example.test', 'PlacementDemo123!'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email is already registered');
    expect(screen.getByRole('button', { name: /Create account/ })).toBeEnabled();
  });
  it('shows Retry-After feedback when login is limited', async () => {
    session.login.mockRejectedValueOnce(new ApiError(429, 'Too many login attempts', {}, 45));
    page();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alex@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'PlacementDemo123!' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 45 seconds.');
  });
  it('never redirects a signed-in user to an external next URL', () => {
    session.user = { id: 'alex' };
    page('login', '/login?next=https%3A%2F%2Fexample.com');
    expect(screen.getByText('My groups destination')).toBeInTheDocument();
  });
  it('does not show a login form while restoring the browser session', () => {
    session.loading = true;
    page();
    expect(screen.getByRole('status')).toHaveTextContent('Opening your nest');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});
