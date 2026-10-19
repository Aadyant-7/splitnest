import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(sessionStorage.getItem(key)).toBeNull();
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
    expect(screen.getByText('No statement uploaded yet')).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });
});
