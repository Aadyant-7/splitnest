import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../shared/api/client';
import type { ImportJob } from '../../shared/api/types';
import { ImportsPanel } from './ImportsPanel';

vi.mock('../../shared/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/api/client')>(), api: vi.fn(),
}));
vi.mock('../../app/SessionContext', () => ({
  useSession: () => ({ user: { id: 'current-user', displayName: 'Alex' } }),
}));

const jobId = 'a04f85fe-d7e7-4411-8395-ea100e76aa61';
const key = 'splitnest:import-job:current-user:group-one';
const mockedApi = vi.mocked(api);
function job(changes: Partial<ImportJob> = {}): ImportJob {
  return { id: jobId, status: 'PENDING', fileName: 'statement.csv', totalRows: 0,
    importedRows: 0, invalidRows: 0, errorMessage: null,
    createdAt: '2026-10-19T10:00:00Z', startedAt: null, completedAt: null, ...changes };
}
function selectFile(file = new File(['date,description,amount\n2026-10-19,Lunch,100.00'], 'statement.csv', { type: 'text/csv' })) {
  fireEvent.change(screen.getByLabelText('Statement file'), { target: { files: [file] } });
}

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('ImportsPanel', () => {
  it('provides a downloadable CSV with the required columns and valid sample rows', () => {
    render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    const sample = screen.getByRole('link', { name: 'Download sample CSV' });
    expect(sample).toHaveAttribute('href', '/examples/statement.csv');
    expect(sample).toHaveAttribute('download', 'splitnest-statement-example.csv');
    const csv = readFileSync(resolve(process.cwd(), 'public/examples/statement.csv'), 'utf8');
    expect(screen.getByText(/BIGBASKET groceries/, { selector: 'pre' }).textContent).toBe(csv.trim().replace(/\r\n/g, '\n'));
    const [header, ...rows] = csv.trim().split(/\r?\n/);
    expect(header).toBe('date,description,amount');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const [date, description, amount] = row.split(',');
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(description).not.toBe('');
      expect(amount).toMatch(/^\d+\.\d{2}$/);
      expect(Number(amount)).toBeGreaterThan(0);
    }
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('keeps incomplete counts out of the result while a statement is processing', async () => {
    sessionStorage.setItem(key, jobId);
    mockedApi.mockResolvedValueOnce(job({ status: 'PROCESSING' }));
    render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    expect(await screen.findByText('PROCESSING', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Rows read')).not.toBeInTheDocument();
    expect(screen.getByText(/Reading your statement and saving valid expenses/)).toBeInTheDocument();
    expect(screen.getByLabelText('Statement file')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload statement' })).toBeDisabled();
  });

  it('clears the previous upload error when a corrected file is selected', async () => {
    mockedApi.mockRejectedValueOnce(new ApiError(400, 'The selected statement is unreadable'));
    render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The selected statement is unreadable');
    selectFile(new File(['date,description,amount\n2026-10-22,Groceries,100.00'], 'corrected.csv'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload statement' })).toBeEnabled();
  });

  it.each<[string, File, RegExp]>([
    ['statement.pdf', new File(['not a statement'], 'statement.pdf'), /Choose a CSV or XLSX file/],
    ['empty CSV', new File([], 'empty.csv'), /containing statement rows/],
    ['oversized CSV', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.csv'), /5 MiB or smaller/],
  ])('rejects %s before sending an upload', (_name, file, message) => {
    render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    selectFile(file);
    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('uploads real multipart data and reports terminal row counts once', async () => {
    const onImported = vi.fn();
    mockedApi.mockResolvedValueOnce(job()).mockResolvedValueOnce(job({ status: 'COMPLETED', totalRows: 3, importedRows: 2, invalidRows: 1 }));
    const { rerender } = render(<ImportsPanel groupId="group-one" onImported={onImported} />);
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }));
    expect(await screen.findByText('Import complete. 2 expenses saved; 1 invalid row skipped.')).toBeInTheDocument();
    const [path, request] = mockedApi.mock.calls[0];
    expect(path).toBe('/groups/group-one/imports');
    expect(request?.method).toBe('POST');
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).get('file')).toBeInstanceOf(File);
    expect(request?.headers).toBeUndefined();
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(key)).toBe(jobId);
    expect(sessionStorage.getItem(`${key}:notified`)).toBe(jobId);
    rerender(<ImportsPanel groupId="group-one" onImported={onImported} />);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('shows a failed zero-valid-row job instead of announcing successful expenses', async () => {
    const onImported = vi.fn();
    mockedApi.mockResolvedValueOnce(job()).mockResolvedValueOnce(job({ status: 'FAILED', totalRows: 2, invalidRows: 2, errorMessage: 'The statement contains no valid rows' }));
    render(<ImportsPanel groupId="group-one" onImported={onImported} />);
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The statement contains no valid rows');
    expect(screen.queryByText(/Import complete/)).not.toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'FAILED'] as const)('restores the latest %s result after returning to the imports tab', async (status) => {
    const finished = job({ status, totalRows: 2, importedRows: status === 'COMPLETED' ? 1 : 0,
      invalidRows: status === 'COMPLETED' ? 1 : 2,
      errorMessage: status === 'FAILED' ? 'The statement contains no valid rows' : null });
    mockedApi.mockResolvedValueOnce(job()).mockResolvedValueOnce(finished).mockResolvedValueOnce(finished);
    const onImported = vi.fn();
    const firstVisit = render(<ImportsPanel groupId="group-one" onImported={onImported} />);
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: 'Upload statement' }));
    expect(await screen.findByText(status, { exact: true })).toBeInTheDocument();
    expect(sessionStorage.getItem(key)).toBe(jobId);
    expect(onImported).toHaveBeenCalledTimes(status === 'COMPLETED' ? 1 : 0);
    firstVisit.unmount();

    render(<ImportsPanel groupId="group-one" onImported={onImported} />);
    expect(await screen.findByText(status, { exact: true })).toBeInTheDocument();
    expect(mockedApi).toHaveBeenLastCalledWith(`/groups/group-one/imports/${jobId}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.queryByText('No recent upload in this tab')).not.toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(status === 'COMPLETED' ? 1 : 0);
    expect(screen.getByRole('button', { name: 'Upload statement' })).toBeEnabled();
  });

  it.each([401, 403, 404])('forgets an inaccessible remembered job after HTTP %s', async (status) => {
    sessionStorage.setItem(key, jobId);
    sessionStorage.setItem(`${key}:notified`, jobId);
    mockedApi.mockRejectedValueOnce(new ApiError(status, 'The previous import is unavailable'));
    const firstVisit = render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The previous import is unavailable');
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(`${key}:notified`)).toBeNull();
    expect(screen.getByText('No recent upload in this tab')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check status again' })).not.toBeInTheDocument();
    firstVisit.unmount();
    render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    expect(screen.getByText('No recent upload in this tab')).toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });

  it('resumes only this user/group job and lets a failed status read be retried', async () => {
    sessionStorage.setItem(key, jobId);
    sessionStorage.setItem('splitnest:import-job:someone-else:group-one', 'unrelated');
    mockedApi.mockRejectedValueOnce(new ApiError(503, 'Status temporarily unavailable'))
      .mockResolvedValueOnce(job({ status: 'COMPLETED', totalRows: 1, importedRows: 1 }));
    const onImported = vi.fn();
    render(<ImportsPanel groupId="group-one" onImported={onImported} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Status temporarily unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Check status again' }));
    expect(await screen.findByText('Import complete. 1 expense saved; 0 invalid rows skipped.')).toBeInTheDocument();
    expect(mockedApi.mock.calls.every(([path]) => path === `/groups/group-one/imports/${jobId}`)).toBe(true);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('honors the upload Retry-After period before enabling another attempt', async () => {
    vi.useFakeTimers();
    mockedApi.mockRejectedValueOnce(new ApiError(429, 'Too many uploads', {}, 3));
    render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    selectFile();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Upload statement' })); });
    expect(screen.getByText('Upload limit reached. Try again in 3 seconds.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload statement' })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByRole('button', { name: 'Upload statement' })).toBeEnabled();
  });

  it('bounds automatic status checks and supports manually continuing later', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem(key, jobId);
    mockedApi.mockResolvedValue(job({ status: 'PROCESSING' }));
    render(<ImportsPanel groupId="group-one" onImported={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(122_000); });
    const calls = mockedApi.mock.calls.length;
    expect(screen.getByRole('button', { name: 'Check status again' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mockedApi).toHaveBeenCalledTimes(calls);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check status again' })); });
    expect(mockedApi.mock.calls.length).toBeGreaterThan(calls);
  });

  it('pauses and aborts a stalled status request instead of spinning forever', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem(key, jobId);
    mockedApi.mockImplementationOnce(() => new Promise<ImportJob>(() => { /* Deliberately stalled connection. */ }));
    const onImported = vi.fn();
    render(<ImportsPanel groupId="group-one" onImported={onImported} />);
    const signal = mockedApi.mock.calls[0][1]?.signal;
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Check status again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload statement' })).toBeEnabled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('aborts the old group status request and ignores its late completion', async () => {
    sessionStorage.setItem(key, jobId);
    let finish: ((value: ImportJob) => void) | undefined;
    mockedApi.mockImplementationOnce(() => new Promise<ImportJob>((resolve) => { finish = resolve; }));
    const onImported = vi.fn();
    const { rerender } = render(<ImportsPanel groupId="group-one" onImported={onImported} />);
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(1));
    const signal = mockedApi.mock.calls[0][1]?.signal;
    rerender(<ImportsPanel groupId="group-two" onImported={onImported} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish?.(job({ status: 'COMPLETED', importedRows: 1 })); });
    expect(screen.getByText('No recent upload in this tab')).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });
});
