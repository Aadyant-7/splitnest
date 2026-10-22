import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../shared/api/client';
import type { Budget, BudgetAlert } from '../../shared/api/types';
import { BudgetsPanel } from './BudgetsPanel';

vi.mock('../../shared/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/api/client')>(), api: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const budget: Budget = { id: 'budget-one', groupId: 'group-one', category: 'FOOD', monthlyLimit: 5000 };
const alert: BudgetAlert = { id: 'alert-one', category: 'FOOD', month: '2026-10-01', spent: 5100,
  monthlyLimit: 5000, createdAt: '2026-10-19T00:00:00Z' };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('BudgetsPanel', () => {
  it('shows real limits and recorded alert snapshots to members without edit controls', async () => {
    mockedApi.mockResolvedValueOnce([budget]).mockResolvedValueOnce([alert]);
    render(<BudgetsPanel groupId="group-one" isAdmin={false} />);
    const limits = await screen.findByRole('table', { name: 'Monthly category limits' });
    expect(within(limits).getByText('Food')).toBeInTheDocument();
    const alerts = screen.getByRole('table', { name: 'Recorded budget alert snapshots' });
    expect(within(alerts).getByText('Spent at detection')).toBeInTheDocument();
    expect(screen.getByText(/checked daily at 00:00 UTC/)).toHaveTextContent('does not run an immediate spending check');
    expect(screen.getByText(/Recorded snapshots from the daily check/)).toHaveTextContent('not live spending totals');
    expect(screen.queryByRole('button', { name: 'Save monthly limit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Food/ })).not.toBeInTheDocument();
    expect(mockedApi.mock.calls.map(([path]) => path)).toEqual(['/groups/group-one/budgets', '/groups/group-one/alerts']);
  });

  it('saves a decimal string as an admin and does not invent a new budget alert', async () => {
    mockedApi.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(budget);
    render(<BudgetsPanel groupId="group-one" isAdmin />);
    fireEvent.change(await screen.findByLabelText('Monthly limit (INR)'), { target: { value: '5000.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save monthly limit' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Food budget saved.');
    expect(mockedApi).toHaveBeenLastCalledWith('/groups/group-one/budgets/FOOD', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ monthlyLimit: '5000.00' }), signal: expect.any(AbortSignal),
    }));
    expect(screen.getByRole('table', { name: 'Monthly category limits' })).toBeInTheDocument();
    expect(screen.getByText('No budget alerts yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly limit (INR)')).toHaveValue('5000.00');
    expect(screen.getByRole('heading', { name: 'Edit monthly limit' })).toBeInTheDocument();
  });

  it('prefills saved limits exactly and focuses the amount when an edit action is selected', async () => {
    const rent: Budget = { id: 'budget-two', groupId: 'group-one', category: 'RENT', monthlyLimit: '9999999999.99' };
    mockedApi.mockResolvedValueOnce([budget, rent]).mockResolvedValueOnce([]);
    render(<BudgetsPanel groupId="group-one" isAdmin />);
    const amount = await screen.findByLabelText('Monthly limit (INR)');
    expect(amount).toHaveValue('5000.00');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rent budget' }));
    expect(screen.getByLabelText('Category')).toHaveValue('RENT');
    expect(amount).toHaveValue('9999999999.99');
    expect(amount).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'TRAVEL' } });
    expect(amount).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Set monthly limit' })).toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledTimes(2);
  });

  it.each(['0.00', '-20', '1e3', '25.001', '10000000000.00'])('rejects invalid amount %s before mutation', async (value) => {
    mockedApi.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<BudgetsPanel groupId="group-one" isAdmin />);
    fireEvent.change(await screen.findByLabelText('Monthly limit (INR)'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Save monthly limit' }));
    expect(screen.getByRole('alert')).toHaveTextContent('positive INR amount');
    expect(mockedApi).toHaveBeenCalledTimes(2);
  });

  it('can retry failed reads without displaying fabricated data', async () => {
    mockedApi.mockRejectedValueOnce(new ApiError(503, 'Budgets unavailable')).mockResolvedValueOnce([])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<BudgetsPanel groupId="group-one" isAdmin={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Budgets unavailable');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry budgets and alerts' }));
    expect(await screen.findByText('No category budgets yet')).toBeInTheDocument();
    expect(screen.getByText('No budget alerts yet')).toBeInTheDocument();
  });

  it('keeps backend validation errors visible and preserves the entered limit', async () => {
    mockedApi.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockRejectedValueOnce(new ApiError(400, 'Request validation failed', { monthlyLimit: 'Limit is invalid' }));
    render(<BudgetsPanel groupId="group-one" isAdmin />);
    const input = await screen.findByLabelText('Monthly limit (INR)');
    fireEvent.change(input, { target: { value: '50.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save monthly limit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Limit is invalid');
    expect(input).toHaveValue('50.00');
    expect(screen.queryByText('Food budget saved.')).not.toBeInTheDocument();
  });

  it('ignores a previous group response after navigation', async () => {
    let finishLimits: ((value: Budget[]) => void) | undefined;
    mockedApi.mockImplementationOnce(() => new Promise<Budget[]>((resolve) => { finishLimits = resolve; }))
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { rerender } = render(<BudgetsPanel groupId="group-one" isAdmin={false} />);
    const signal = mockedApi.mock.calls[0][1]?.signal;
    rerender(<BudgetsPanel groupId="group-two" isAdmin={false} />);
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText('No category budgets yet')).toBeInTheDocument();
    finishLimits?.([budget]);
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
  });
});
