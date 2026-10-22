import { useState } from 'react';
import { api } from '../../shared/api/client';
import type { Balance, Expense, ExpensePage, Member } from '../../shared/api/types';
import { EmptyState, ErrorNotice } from '../../shared/ui/Feedback';
import { money, shortDate } from '../../shared/ui/format';
import { ExpenseForm, categoryName } from './ExpenseForm';

type Props = {
  groupId: string;
  members: Member[];
  balances: Balance[];
  expenses: ExpensePage;
  currentUserId: string;
  isAdmin: boolean;
  onPageChange: (page: number) => void;
  onChanged: () => void;
};

export function ExpensesPanel({ groupId, members, balances, expenses, currentUserId, isAdmin, onPageChange, onChanged }: Props) {
  const [error, setError] = useState<unknown>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const names = new Map([...balances.map((item) => [item.userId, item.displayName] as const), ...members.map((item) => [item.userId, item.displayName] as const)]);

  async function remove(expense: Expense) {
    if (!window.confirm(`Delete “${expense.description}” for ${money(expense.amount)}? This also removes its stored shares.`)) return;
    setDeletingId(expense.id);
    setError(null);
    try {
      await api(`/groups/${groupId}/expenses/${expense.id}`, { method: 'DELETE' });
      onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="workspace-columns">
      <ExpenseForm groupId={groupId} members={members} currentUserId={currentUserId} onCreated={() => { onPageChange(0); onChanged(); }} />
      <section className="panel stack expense-history" aria-labelledby="expenses-heading">
        <div className="section-heading"><h2 id="expenses-heading">Expenses</h2><span className="muted">{expenses.totalElements} total</span></div>
        <ErrorNotice error={error} />
        {expenses.content.length === 0 ? <EmptyState title="No expenses yet">Add an expense to start tracking what everyone paid and owes.</EmptyState> : (
          <div className="table-wrap">
            <table className="table ledger-table">
              <caption className="sr-only">Expenses, newest entries first. Expand stored shares for the original split.</caption>
              <thead><tr><th scope="col">Expense</th><th scope="col">Paid by</th><th scope="col">Date</th><th className="numeric-cell" scope="col">Amount</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{expenses.content.map((expense) => (
                <tr key={expense.id}>
                  <th scope="row">
                    <div className="cell-primary">{expense.description}</div><span className="muted cell-secondary">{categoryName(expense.category)}</span> {expense.importJobId && <span className="tag">Statement import</span>}
                    <details>
                      <summary>Stored shares for {expense.description}</summary>
                      <ul className="shares-list">{expense.splits.map((split) => <li key={split.userId}>{names.get(split.userId) ?? 'Former member'}: {money(split.shareAmount)}</li>)}</ul>
                    </details>
                  </th>
                  <td data-label="Paid by">{names.get(expense.paidBy) ?? 'Former member'}{expense.paidBy === currentUserId && ' (you)'}</td>
                  <td data-label="Date">{shortDate(expense.expenseDate)}</td><td data-label="Amount" className="numeric-cell"><strong>{money(expense.amount)}</strong></td>
                  <td>{isAdmin || expense.createdBy === currentUserId ? (
                    <button type="button" className="button danger" aria-label={`Delete ${expense.description}`} disabled={deletingId !== null} onClick={() => void remove(expense)}>{deletingId === expense.id ? 'Deleting…' : 'Delete'}</button>
                  ) : <span className="muted" aria-label="Only the creator or an admin can delete this expense">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {!expenses.first || !expenses.last ? (
          <nav className="pagination" aria-label="Expense pages">
            <button className="button secondary" type="button" disabled={expenses.first} onClick={() => onPageChange(expenses.number - 1)}>Previous</button>
            <span className="muted">Page {expenses.number + 1} of {Math.max(expenses.totalPages, 1)}</span>
            <button className="button secondary" type="button" disabled={expenses.last} onClick={() => onPageChange(expenses.number + 1)}>Next</button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
