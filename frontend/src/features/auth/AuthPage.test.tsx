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
    <Route path="/app/home" element={<p>Home destination</p>} />
    <Route path="/app/groups/:groupId" element={<p>Requested group destination</p>} />
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
    expect(screen.getByText('Home destination')).toBeInTheDocument();
  });
  it('does not show a login form while restoring the browser session', () => {
    session.loading = true;
    page();
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your session');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
  it('connects server field errors to the corresponding inputs', async () => {
    session.register.mockRejectedValueOnce(new ApiError(400, 'Check your details', { email: 'Email is invalid', password: 'Password is too short' }));
    page('register');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alex@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SyntheticPassword123!' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription('Email is invalid');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Password is too short');
  });
  it('lets the user reveal and hide their password without submitting', () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(session.login).not.toHaveBeenCalled();
  });
  it('keeps one authentication request in flight when a form is submitted twice', async () => {
    let complete!: () => void;
    session.login.mockReturnValueOnce(new Promise<void>((resolve) => { complete = resolve; }));
    page();
    const form = screen.getByRole('form', { name: 'Sign in' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(session.login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    complete();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  });
  it('opens the home dashboard by default after session restoration', () => {
    session.user = { id: 'alex' };
    page();
    expect(screen.getByText('Home destination')).toBeInTheDocument();
  });
  it('retains a requested group section when switching between authentication forms', () => {
    const destination = '/app/groups/group-1?tab=imports';
    page('login', '/login?next=' + encodeURIComponent(destination));
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register?next=' + encodeURIComponent(destination));
  });
  it('returns a signed-in account to the requested group route', () => {
    session.user = { id: 'alex' };
    page('login', '/login?next=' + encodeURIComponent('/app/groups/group-1?tab=imports'));
    expect(screen.getByText('Requested group destination')).toBeInTheDocument();
  });
});
