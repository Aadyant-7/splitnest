import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, ApiError } from '../../shared/api/client';
import type { Balance, Expense, ExpensePage, Member } from '../../shared/api/types';
import { BalancePanel } from './BalancePanel';
import { ExpensesPanel } from './ExpensesPanel';

vi.mock('../../shared/api/client', async () => ({
  ...await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client'), api: vi.fn(),
}));

const members: Member[] = [
  { userId: 'alice', email: 'alice@example.test', displayName: 'Alice', role: 'ADMIN', joinedAt: '2026-10-19T00:00:00Z' },
  { userId: 'bob', email: 'bob@example.test', displayName: 'Bob', role: 'MEMBER', joinedAt: '2026-10-19T00:00:00Z' },
];
const balances: Balance[] = [
  { userId: 'alice', displayName: 'Alice', currentMember: true, totalPaid: 100, totalShare: 33.34, netBalance: 66.66 },
  { userId: 'bob', displayName: 'Bob', currentMember: true, totalPaid: 0, totalShare: 33.33, netBalance: -33.33 },
  { userId: 'former', displayName: 'Charlie', currentMember: false, totalPaid: 0, totalShare: 33.33, netBalance: -33.33 },
];
const expense: Expense = {
  id: 'dinner', groupId: 'trip', paidBy: 'alice', amount: 100, description: 'Dinner', category: 'FOOD', expenseDate: '2026-10-18',
  createdBy: 'alice', importJobId: null, createdAt: '2026-10-19T00:00:00Z',
  splits: [{ userId: 'alice', shareAmount: 33.34 }, { userId: 'bob', shareAmount: 33.33 }, { userId: 'former', shareAmount: 33.33 }],
};
const page: ExpensePage = { content: [expense], number: 0, size: 20, totalElements: 21, totalPages: 2, first: true, last: false };

function panel(options: { userId?: string; admin?: boolean; expensePage?: ExpensePage } = {}) {
  const onChanged = vi.fn();
  const onPageChange = vi.fn();
  render(<ExpensesPanel groupId="trip" members={members} balances={balances} expenses={options.expensePage ?? page} currentUserId={options.userId ?? 'alice'} isAdmin={options.admin ?? false} onChanged={onChanged} onPageChange={onPageChange} />);
  return { onChanged, onPageChange };
}

describe('Expense history and balances', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the stored uneven shares and identifies former members without changing historical amounts', () => {
    panel();
    fireEvent.click(screen.getByText('Stored shares for Dinner'));
    const shares = screen.getByText('Stored shares for Dinner').closest('details');
    expect(shares).not.toBeNull();
    expect(within(shares!).getByText(/Alice:.*33.34/)).toBeInTheDocument();
    expect(within(shares!).getByText(/Charlie:.*33.33/)).toBeInTheDocument();
  });

  it('shows positive and negative backend balances including a former member', () => {
    render(<BalancePanel balances={balances} currentUserId="alice" />);
    expect(screen.getByText('Former member')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('is owed')).toBeInTheDocument();
    expect(screen.getByText(/66.66/).closest('td')).toHaveClass('balance-positive');
    expect(screen.getAllByText('owes')).toHaveLength(2);
  });

  it('does not offer deletion to another expense creator, while leaving pagination usable', () => {
    const { onPageChange } = panel({ userId: 'bob' });
    expect(screen.queryByRole('button', { name: 'Delete Dinner' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('does not send a deletion when the confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dinner' }));
    expect(api).not.toHaveBeenCalled();
  });

  it('allows an admin to delete another creator’s expense and requests a fresh ledger', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api).mockResolvedValue(undefined);
    const { onChanged } = panel({ userId: 'bob', admin: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dinner' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith('/groups/trip/expenses/dinner', { method: 'DELETE' });
  });

  it('shows server-side permission failure without claiming the deletion succeeded', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api).mockRejectedValue(new ApiError(403, 'Only the creator or an admin can delete this expense.'));
    const { onChanged } = panel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dinner' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the creator');
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
  });
});
