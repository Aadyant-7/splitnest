import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { api, ApiError } from '../../shared/api/client';
import type { Balance, Expense, ExpensePage, Group, Member } from '../../shared/api/types';
import { GroupPage } from './GroupPage';

vi.mock('../../shared/api/client', async () => ({
  ...await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client'), api: vi.fn(),
}));
vi.mock('../../app/SessionContext', () => ({ useSession: () => ({ user: { id: 'alice', displayName: 'Alice' } }) }));
vi.mock('../imports/ImportsPanel', () => ({ ImportsPanel: ({ onImported }: { onImported: () => void }) => <button onClick={onImported}>Finish statement import</button> }));
vi.mock('../budgets/BudgetsPanel', () => ({ BudgetsPanel: () => <h2>Category budget limits</h2> }));

const members: Member[] = [
  { userId: 'alice', email: 'alice@example.test', displayName: 'Alice', role: 'ADMIN', joinedAt: '2026-10-19T00:00:00Z' },
  { userId: 'bob', email: 'bob@example.test', displayName: 'Bob', role: 'MEMBER', joinedAt: '2026-10-19T00:00:00Z' },
];
const group: Group = { id: 'trip', name: 'Goa weekend', createdBy: 'alice', createdAt: '2026-10-19T00:00:00Z', members };
const balances: Balance[] = [
  { userId: 'alice', displayName: 'Alice', currentMember: true, totalPaid: 100, totalShare: 50, netBalance: 50 },
  { userId: 'bob', displayName: 'Bob', currentMember: true, totalPaid: 0, totalShare: 50, netBalance: -50 },
];
const expense: Expense = { id: 'dinner', groupId: 'trip', paidBy: 'alice', amount: 100, description: 'Dinner', category: 'FOOD', expenseDate: '2026-10-19', createdBy: 'alice', importJobId: null, createdAt: '2026-10-19T00:00:00Z', splits: [{ userId: 'alice', shareAmount: 50 }, { userId: 'bob', shareAmount: 50 }] };
const page: ExpensePage = { content: [expense], number: 0, size: 20, totalElements: 1, totalPages: 1, first: true, last: true };

function installApi(handler: (path: string, init?: RequestInit) => unknown) {
  vi.mocked(api).mockImplementation(async <T,>(path: string, init?: RequestInit): Promise<T> => handler(path, init) as T);
}
function renderPage() {
  render(<MemoryRouter initialEntries={['/app/groups/trip']}><Routes><Route path="/app/groups/:groupId" element={<GroupPage />} /></Routes></MemoryRouter>);
}
function ordinaryResponse(path: string) {
  if (path === '/groups/trip') return group;
  if (path.endsWith('/balances')) return balances;
  if (path.includes('/expenses?')) return page;
  throw new Error(`Unexpected test request: ${path}`);
}

describe('GroupPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads real group, aggregate balances and expense count without inventing a spending summary', async () => {
    installApi(ordinaryResponse);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Goa weekend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 members' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1 expense' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group balances' })).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('refetches the roster, expense page and balances after a membership change', async () => {
    const charlie: Member = { userId: 'charlie', email: 'charlie@example.test', displayName: 'Charlie', role: 'MEMBER', joinedAt: '2026-10-19T00:00:00Z' };
    let added = false;
    installApi((path, init) => {
      if (path.endsWith('/members') && init?.method === 'POST') { added = true; return charlie; }
      if (path === '/groups/trip') return { ...group, members: added ? [...members, charlie] : members };
      return ordinaryResponse(path);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Goa weekend' });
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    fireEvent.change(screen.getByLabelText('Member email'), { target: { value: 'charlie@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(await screen.findByText('Charlie')).toBeInTheDocument();
    expect(vi.mocked(api).mock.calls.filter(([path]) => path === '/groups/trip')).toHaveLength(2);
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.endsWith('/balances'))).toHaveLength(2);
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.includes('/expenses?'))).toHaveLength(2);
  });

  it('returns to the previous real page after deleting the final row of the last page', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted = false;
    installApi((path, init) => {
      if (init?.method === 'DELETE') { deleted = true; return undefined; }
      if (path.includes('/expenses?page=1')) return deleted
        ? { ...page, content: [], number: 1, totalElements: 20, totalPages: 1, first: false, last: true }
        : { ...page, content: [{ ...expense, id: 'taxi', description: 'Final taxi' }], number: 1, totalElements: 21, totalPages: 2, first: false, last: true };
      if (path.includes('/expenses?page=0')) return { ...page, totalElements: deleted ? 20 : 21, totalPages: deleted ? 1 : 2, last: deleted };
      return ordinaryResponse(path);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Goa weekend' });
    fireEvent.click(screen.getByRole('button', { name: 'Expenses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Final taxi' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Final taxi' })).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Delete Dinner' })).toBeInTheDocument();
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.includes('/expenses?page=0'))).toHaveLength(2);
  });

  it('refreshes the entire workspace when a statement import completes', async () => {
    installApi(ordinaryResponse);
    renderPage();
    await screen.findByRole('heading', { name: 'Goa weekend' });
    fireEvent.click(screen.getByRole('button', { name: 'Imports' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish statement import' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(6));
  });

  it('shows a 404 without exposing a group workspace and supports retry', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(404, 'Group not found.'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'We couldn’t open this group' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Group not found');
    expect(screen.queryByRole('button', { name: 'Expenses' })).not.toBeInTheDocument();
    installApi(ordinaryResponse);
    fireEvent.click(screen.getByRole('button', { name: 'Try opening group again' }));
    expect(await screen.findByRole('heading', { name: 'Goa weekend' })).toBeInTheDocument();
  });
});
