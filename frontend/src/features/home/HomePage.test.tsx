import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../shared/api/client';
import type { GroupSummary, User } from '../../shared/api/types';
import { HomePage } from './HomePage';

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('../../app/SessionContext', () => ({ useSession: () => session }));
vi.mock('../../shared/api/client', async () => ({
  ...await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client'), api: vi.fn(),
}));

const alice: User = { id: 'alice', displayName: 'Alice', email: 'alice@example.test', createdAt: '2026-10-23T00:00:00Z' };
function group(id: string, name: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER'): GroupSummary {
  return { id, name, role, createdBy: 'alice', createdAt: '2026-10-23T00:00:00Z' };
}
function page() { return <MemoryRouter><HomePage /></MemoryRouter>; }

describe('HomePage', () => {
  beforeEach(() => { vi.clearAllMocks(); session.user = alice; });

  it('welcomes the account and guides a new user toward real group creation', async () => {
    vi.mocked(api).mockResolvedValue([]);
    render(page());
    expect(screen.getByRole('heading', { name: 'Welcome, Alice' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Your first group starts here' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a group' })).toHaveAttribute('href', '/app/groups#create-group');
    expect(screen.getByRole('link', { name: 'Set up your first group' })).toHaveAttribute('href', '/app/groups#create-group');
    expect(screen.getByText(/registered email/)).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Illustration: from a group to an expense and equal shares' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Take a quick tour/ })).toHaveAttribute('href', '/app/guide');
  });

  it('shows only actual group counts and previews up to three real workspaces', async () => {
    vi.mocked(api).mockResolvedValue([
      group('home', 'Maple House', 'ADMIN'), group('trip', 'Goa weekend'),
      group('family', 'Family meals', 'ADMIN'), group('work', 'Team lunch'),
    ]);
    render(page());
    const summary = await screen.findByLabelText('Your group summary');
    expect(within(summary).getByText('Groups you belong to').nextElementSibling).toHaveTextContent('4');
    expect(within(summary).getByText('Groups you manage').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: /Maple House/ })).toHaveAttribute('href', '/app/groups/home');
    expect(screen.getByRole('link', { name: /Goa weekend/ })).toHaveAttribute('href', '/app/groups/trip');
    expect(screen.getByRole('link', { name: /Family meals/ })).toHaveAttribute('href', '/app/groups/family');
    expect(screen.queryByRole('link', { name: /Team lunch/ })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 4 groups. Open all groups to choose another.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open a group' })).toHaveAttribute('href', '/app/groups/home?tab=expenses');
    expect(screen.queryByText(/₹|total expenses|recent activity|total owed/i)).not.toBeInTheDocument();
  });

  it('does not display a zero group count before the server responds', async () => {
    let resolveGroups!: (value: GroupSummary[]) => void;
    vi.mocked(api).mockImplementation(() => new Promise((resolve) => { resolveGroups = resolve; }));
    render(page());
    expect(screen.getByRole('status')).toHaveTextContent('Loading your groups');
    expect(screen.queryByLabelText('Your group summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Your first group starts here')).not.toBeInTheDocument();
    await act(async () => { resolveGroups([group('trip', 'Goa weekend')]); });
    expect(screen.getByText('Groups you belong to').nextElementSibling).toHaveTextContent('1');
  });

  it('offers a working retry without showing stale counts or a fake empty account', async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(503, 'The service is temporarily unavailable.')).mockResolvedValueOnce([group('house', 'Our apartment')]);
    render(page());
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByLabelText('Your group summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Your first group starts here')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try loading groups again' }));
    expect(await screen.findByRole('link', { name: /Our apartment/ })).toHaveAttribute('href', '/app/groups/house');
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('keeps tool guidance linked to the matching in-app guide sections', async () => {
    vi.mocked(api).mockResolvedValue([]);
    render(page());
    await screen.findByText('Your first group starts here');
    expect(screen.getByRole('link', { name: /Know where you stand/ })).toHaveAttribute('href', '/app/guide#balances');
    expect(screen.getByRole('link', { name: /Skip the repeated typing/ })).toHaveAttribute('href', '/app/guide#imports');
    expect(screen.getByRole('link', { name: /Keep category limits in view/ })).toHaveAttribute('href', '/app/guide#budgets');
  });

  it('aborts the prior account request and ignores its late response after an account change', async () => {
    let resolveOld!: (value: GroupSummary[]) => void;
    vi.mocked(api).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce([group('bob-trip', 'Bob trip')]);
    const view = render(page());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(api).mock.calls[0][1]?.signal;
    session.user = { ...alice, id: 'bob', displayName: 'Bob', email: 'bob@example.test' };
    view.rerender(page());
    expect(await screen.findByRole('link', { name: /Bob trip/ })).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { resolveOld([group('alice-house', 'Alice private group')]); });
    expect(screen.getByRole('heading', { name: 'Welcome, Bob' })).toBeInTheDocument();
    expect(screen.queryByText('Alice private group')).not.toBeInTheDocument();
  });

  it('aborts its list request when leaving Home', async () => {
    vi.mocked(api).mockImplementation(() => new Promise(() => undefined));
    const view = render(page());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(api).mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('does not request account data while the session has no authenticated user', () => {
    session.user = null;
    render(page());
    expect(screen.getByRole('status')).toHaveTextContent('Loading your workspace');
    expect(api).not.toHaveBeenCalled();
  });
});
