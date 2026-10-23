import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
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
function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="Current location">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate(1)}>Browser forward</button><button onClick={() => navigate('/app/groups/second?tab=budgets')}>Open second group</button></>;
}
function renderPage(initialEntry = '/app/groups/trip') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><NavigationProbe /><Routes><Route path="/app/groups/:groupId" element={<GroupPage />} /></Routes></MemoryRouter>);
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
    expect(screen.getByText(/2 members.*Admin.*INR/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('tab', { name: 'Members' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Expenses' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Imports' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish statement import' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(6));
  });

  it('shows a 404 without exposing a group workspace and supports retry', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(404, 'Group not found.'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'We couldn’t open this group' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Group not found');
    expect(screen.queryByRole('tab', { name: 'Expenses' })).not.toBeInTheDocument();
    installApi(ordinaryResponse);
    fireEvent.click(screen.getByRole('button', { name: 'Try opening group again' }));
    expect(await screen.findByRole('heading', { name: 'Goa weekend' })).toBeInTheDocument();
  });

  it('supports a single tab stop and arrow, Home and End navigation for group sections', async () => {
    installApi(ordinaryResponse);
    renderPage();
    await screen.findByRole('heading', { name: 'Goa weekend' });
    const overview = screen.getByRole('tab', { name: 'Overview' });
    const expenses = screen.getByRole('tab', { name: 'Expenses' });
    const budgets = screen.getByRole('tab', { name: 'Budgets' });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(overview).toHaveAttribute('tabindex', '0');
    expect(expenses).toHaveAttribute('tabindex', '-1');
    for (const section of screen.getAllByRole('tab')) {
      expect(document.getElementById(section.getAttribute('aria-controls')!)).toBeInTheDocument();
    }

    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(expenses).toHaveFocus();
    expect(expenses).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Expenses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add an expense' })).toBeInTheDocument();

    fireEvent.keyDown(expenses, { key: 'End' });
    expect(budgets).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Budgets' })).toBeInTheDocument();
    fireEvent.keyDown(budgets, { key: 'ArrowRight' });
    expect(overview).toHaveFocus();
    fireEvent.keyDown(overview, { key: 'ArrowLeft' });
    expect(budgets).toHaveFocus();
    fireEvent.keyDown(budgets, { key: 'Home' });
    expect(overview).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Overview' })).toBeInTheDocument();
  });

  it.each(['overview', 'expenses', 'members', 'imports', 'budgets'])('opens the %s section directly from a copied URL', async (section) => {
    installApi(ordinaryResponse);
    renderPage(`/app/groups/trip?tab=${section}`);
    await screen.findByRole('heading', { name: 'Goa weekend' });
    const selected = screen.getByRole('tab', { name: new RegExp(`^${section}$`, 'i') });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', selected.id);
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('falls back to Overview for an unsupported section without losing other query parameters', async () => {
    installApi(ordinaryResponse);
    renderPage('/app/groups/trip?tab=unknown&from=home');
    await screen.findByRole('heading', { name: 'Goa weekend' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(screen.getByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/app/groups/trip?tab=expenses&from=home');
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('keeps section navigation synchronized with browser Back and Forward', async () => {
    installApi(ordinaryResponse);
    renderPage('/app/groups/trip?tab=members&from=home');
    await screen.findByRole('heading', { name: 'Goa weekend' });
    fireEvent.click(screen.getByRole('tab', { name: 'Expenses' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Budgets' }));
    expect(screen.getByLabelText('Current location')).toHaveTextContent('?tab=budgets&from=home');
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.getByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Browser forward' }));
    expect(screen.getByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'true');
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('restores the selected section on remount and lets overview actions update its URL', async () => {
    installApi(ordinaryResponse);
    const mounted = renderPage();
    await screen.findByRole('heading', { name: 'Goa weekend' });
    fireEvent.click(screen.getByRole('button', { name: 'View expenses' }));
    const savedLocation = screen.getByLabelText('Current location').textContent!;
    expect(savedLocation).toBe('/app/groups/trip?tab=expenses');
    mounted.unmount();
    renderPage(savedLocation);
    await screen.findByRole('heading', { name: 'Goa weekend' });
    expect(screen.getByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Add an expense' })).toBeInTheDocument();
  });

  it('uses the destination group URL and resets expense pagination when switching groups', async () => {
    installApi((path) => {
      if (path === '/groups/second') return { ...group, id: 'second', name: 'Apartment' };
      if (path.includes('/expenses?page=1')) return { ...page, number: 1, totalElements: 21, totalPages: 2, first: false, last: true };
      if (path.includes('/expenses?page=0')) return { ...page, totalElements: 21, totalPages: 2, last: false };
      return ordinaryResponse(path);
    });
    renderPage('/app/groups/trip?tab=expenses');
    await screen.findByRole('heading', { name: 'Goa weekend' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Open second group' }));
    await screen.findByRole('heading', { name: 'Apartment' });
    expect(screen.getByRole('tab', { name: 'Budgets' })).toHaveAttribute('aria-selected', 'true');
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.startsWith('/groups/second/expenses?')).at(-1)?.[0]).toContain('page=0');
  });
});
