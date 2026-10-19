import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api, ApiError } from '../../shared/api/client';
import type { Member } from '../../shared/api/types';
import { MembersPanel } from './MembersPanel';

vi.mock('../../shared/api/client', async () => ({
  ...await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client'), api: vi.fn(),
}));
const members: Member[] = [
  { userId: 'alice', email: 'alice@example.test', displayName: 'Alice', role: 'ADMIN', joinedAt: '2026-10-19T00:00:00Z' },
  { userId: 'bob', email: 'bob@example.test', displayName: 'Bob', role: 'MEMBER', joinedAt: '2026-10-19T00:00:00Z' },
];
function panel(isAdmin = true) {
  const onChanged = vi.fn();
  render(<MembersPanel groupId="trip" members={members} currentUserId={isAdmin ? 'alice' : 'bob'} isAdmin={isAdmin} onChanged={onChanged} />);
  return onChanged;
}

describe('MembersPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('adds an existing user by normalized email and refreshes financial data', async () => {
    vi.mocked(api).mockResolvedValue({});
    const onChanged = panel();
    fireEvent.change(screen.getByLabelText('Member email'), { target: { value: 'Friend@Example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith('/groups/trip/members', { method: 'POST', body: JSON.stringify({ email: 'friend@example.test' }) });
    expect(screen.getByRole('status')).toHaveTextContent('Future expenses include the updated group');
  });

  it('shows members without admin controls for an ordinary member', () => {
    panel(false);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Bob' })).not.toBeInTheDocument();
  });

  it('keeps the final admin and confirms that removing a member retains history', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api).mockResolvedValue(undefined);
    const onChanged = panel();
    expect(screen.getByText('Last admin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Alice' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bob' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('past expenses and shares are kept'));
    expect(api).toHaveBeenCalledWith('/groups/trip/members/bob', { method: 'DELETE' });
  });

  it('keeps a server-rejected membership mutation visible as an error', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'That user is already a member.'));
    const onChanged = panel();
    fireEvent.change(screen.getByLabelText('Member email'), { target: { value: 'bob@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already a member');
    expect(screen.getByLabelText('Member email')).toHaveValue('bob@example.test');
    expect(onChanged).not.toHaveBeenCalled();
  });
});
