import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { api, ApiError } from '../../shared/api/client';
import { GroupsPage } from './GroupsPage';

vi.mock('../../shared/api/client', async () => ({
  ...await vi.importActual<typeof import('../../shared/api/client')>('../../shared/api/client'), api: vi.fn(),
}));
vi.mock('../../app/SessionContext', () => ({ useSession: () => ({ user: { id: 'alice', displayName: 'Alice' } }) }));

function renderPage() {
  render(<MemoryRouter initialEntries={['/app/groups']}><Routes><Route path="/app/groups" element={<GroupsPage />} /><Route path="/app/groups/:groupId" element={<h1>New group workspace</h1>} /></Routes></MemoryRouter>);
}

describe('GroupsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows actual group links and caller roles', async () => {
    vi.mocked(api).mockResolvedValue([{ id: 'trip', name: 'Goa weekend', role: 'MEMBER', createdAt: '2026-10-19T00:00:00Z', createdBy: 'bob' }]);
    renderPage();
    expect(await screen.findByRole('link', { name: 'Goa weekend' })).toHaveAttribute('href', '/app/groups/trip');
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/groups', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('creates a trimmed group and opens its real workspace', async () => {
    vi.mocked(api).mockResolvedValueOnce([]).mockResolvedValueOnce({ id: 'new-trip' });
    renderPage();
    await screen.findByText('No groups yet');
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: '  Our apartment  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(await screen.findByRole('heading', { name: 'New group workspace' })).toBeInTheDocument();
    expect(api).toHaveBeenLastCalledWith('/groups', { method: 'POST', body: JSON.stringify({ name: 'Our apartment' }) });
  });

  it('offers a retry after a failed list request', async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(503, 'The service is temporarily unavailable.')).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try loading groups again' }));
    expect(await screen.findByText('No groups yet')).toBeInTheDocument();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it('retains the group name when creation fails', async () => {
    vi.mocked(api).mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError(429, 'Please wait before creating another group.', {}, 30));
    renderPage();
    await screen.findByText('No groups yet');
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Apartment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('30 seconds');
    expect(screen.getByLabelText('Group name')).toHaveValue('Apartment');
  });

  it('rejects a whitespace-only group name without losing the creation form', async () => {
    vi.mocked(api).mockResolvedValueOnce([]);
    renderPage();
    await screen.findByText('No groups yet');
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give your group a name');
    expect(api).toHaveBeenCalledTimes(1);
  });
});
