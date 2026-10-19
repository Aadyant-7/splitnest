import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api, ApiError } from '../../shared/api/client';
import type { Member } from '../../shared/api/types';
import { ExpenseForm } from './ExpenseForm';

vi.mock('../../shared/api/client', async () => ({
  ...await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client'), api: vi.fn(),
}));

const members: Member[] = [
  { userId: 'alice', email: 'alice@example.test', displayName: 'Alice', role: 'ADMIN', joinedAt: '2026-10-19T00:00:00Z' },
  { userId: 'bob', email: 'bob@example.test', displayName: 'Bob', role: 'MEMBER', joinedAt: '2026-10-19T00:00:00Z' },
];

function fill(amount = '100.00') {
  fireEvent.change(screen.getByLabelText('Amount (INR)'), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '  Shared dinner  ' } });
}

describe('ExpenseForm', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends the exact decimal text and chosen payer without computing shares in the browser', async () => {
    vi.mocked(api).mockResolvedValue({});
    const onCreated = vi.fn();
    render(<ExpenseForm groupId="trip" members={members} currentUserId="alice" onCreated={onCreated} />);
    fill();
    fireEvent.change(screen.getByLabelText('Paid by'), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText('Expense date'), { target: { value: '2026-10-18' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'TRAVEL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith('/groups/trip/expenses', {
      method: 'POST', body: JSON.stringify({ amount: '100.00', description: 'Shared dinner', category: 'TRAVEL', expenseDate: '2026-10-18', paidBy: 'bob' }),
    });
    expect(screen.getByLabelText('Amount (INR)')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Expense added');
  });

  it.each(['0', '0.00', '100.001', '10000000000', '-1', '1e3'])('rejects invalid amount %s before sending a request', async (amount) => {
    render(<ExpenseForm groupId="trip" members={members} currentUserId="alice" onCreated={vi.fn()} />);
    fill(amount);
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at most two decimal places');
    expect(api).not.toHaveBeenCalled();
  });

  it('keeps entered values and shows the server error when membership changes before saving', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(400, 'The payer must be a current group member.'));
    const onCreated = vi.fn();
    render(<ExpenseForm groupId="trip" members={members} currentUserId="alice" onCreated={onCreated} />);
    fill('0.01');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('payer must be a current group member');
    expect(screen.getByLabelText('Amount (INR)')).toHaveValue('0.01');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
