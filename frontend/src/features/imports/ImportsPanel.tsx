import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { api, ApiError } from '../../shared/api/client';
import type { ImportJob } from '../../shared/api/types';
import { EmptyState, ErrorNotice } from '../../shared/ui/Feedback';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const POLL_INTERVAL_MS = 2_000;
const AUTO_POLL_DURATION_MS = 2 * 60_000;
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function rememberedJob(key: string): string | null {
  try {
    const id = sessionStorage.getItem(key);
    return id && UUID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

function rememberJob(key: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    // Private browsing/storage restrictions must not prevent an actual upload.
  }
}

export function ImportsPanel({ groupId, onImported }: { groupId: string; onImported: () => void }) {
  const { user } = useSession();
  const storageKey = `splitnest:import-job:${user?.id ?? 'anonymous'}:${groupId}`;
  // A new group/account gets a new lifecycle, including aborting the old requests.
  return <ImportWorkspace key={storageKey} groupId={groupId} storageKey={storageKey} onImported={onImported} />;
}

function ImportWorkspace({ groupId, storageKey, onImported }: {
  groupId: string; storageKey: string; onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(() => rememberedJob(storageKey));
  const [job, setJob] = useState<ImportJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(Boolean(jobId));
  const [paused, setPaused] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [pollError, setPollError] = useState<unknown>(null);
  const [validation, setValidation] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);
  const uploadRequest = useRef<AbortController | null>(null);
  const completedJob = useRef<string | null>(null);
  const onImportedRef = useRef(onImported);
  const fileInput = useRef<HTMLInputElement>(null);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1_000));

  useEffect(() => { onImportedRef.current = onImported; }, [onImported]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) setRetryAt(0);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    if (!jobId) return;
    const request = new AbortController();
    let active = true;
    let timer: number | undefined;
    const startedAt = Date.now();
    setPolling(true);
    setPaused(false);
    setPollError(null);
    // Also bound a stalled network request, not only successive successful polls.
    const deadline = window.setTimeout(() => {
      if (!active) return;
      request.abort();
      window.clearTimeout(timer);
      setPolling(false);
      setPaused(true);
    }, AUTO_POLL_DURATION_MS);

    async function checkStatus() {
      try {
        const updated = await api<ImportJob>(`/groups/${groupId}/imports/${jobId}`, { signal: request.signal });
        if (!active || request.signal.aborted) return;
        setJob(updated);
        if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
          window.clearTimeout(deadline);
          setPolling(false);
          rememberJob(storageKey, null);
          if (updated.status === 'COMPLETED' && completedJob.current !== updated.id) {
            completedJob.current = updated.id;
            onImportedRef.current();
          }
          return;
        }
        if (Date.now() - startedAt >= AUTO_POLL_DURATION_MS) {
          setPolling(false);
          setPaused(true);
          return;
        }
        timer = window.setTimeout(checkStatus, POLL_INTERVAL_MS);
      } catch (error) {
        if (!active || request.signal.aborted) return;
        setPollError(error);
        window.clearTimeout(deadline);
        setPolling(false);
        setPaused(true);
      }
    }

    void checkStatus();
    return () => {
      active = false;
      request.abort();
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
    };
  }, [groupId, jobId, pollAttempt, storageKey]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading || retrySeconds > 0) return;
    setValidation('');
    setUploadError(null);
    if (!file) { setValidation('Choose a CSV or XLSX statement first.'); return; }
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setValidation('Choose a CSV or XLSX file.'); return; }
    if (file.size === 0) { setValidation('Choose a file containing statement rows.'); return; }
    if (file.size > MAX_FILE_BYTES) { setValidation('The file must be 5 MiB or smaller.'); return; }

    const request = new AbortController();
    uploadRequest.current = request;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      // The browser supplies the multipart boundary; do not set Content-Type.
      const accepted = await api<ImportJob>(`/groups/${groupId}/imports`, {
        method: 'POST', body, signal: request.signal,
      });
      if (!mounted.current || request.signal.aborted) return;
      setJob(accepted);
      rememberJob(storageKey, accepted.id);
      setJobId(accepted.id);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (error) {
      if (!mounted.current || request.signal.aborted) return;
      setUploadError(error);
      if (error instanceof ApiError && error.status === 429 && error.retryAfter != null) {
        const current = Date.now();
        setNow(current);
        setRetryAt(current + Math.max(0, error.retryAfter) * 1_000);
      }
    } finally {
      if (mounted.current && !request.signal.aborted) setUploading(false);
    }
  }

  return <section className="panel stack" aria-labelledby="imports-heading">
    <div>
      <p className="eyebrow">Statements</p>
      <h2 id="imports-heading">Import shared expenses</h2>
      <p className="muted">Upload a CSV or XLSX statement, up to 5 MiB. Imported expenses are paid by you and split equally among the current members when saved.</p>
    </div>
    <form className="stack" onSubmit={upload} noValidate>
      <label className="field" htmlFor="statement-file">
        <span>Statement file</span>
        <input ref={fileInput} id="statement-file" type="file" accept=".csv,.xlsx" disabled={uploading}
          aria-invalid={Boolean(validation)} aria-describedby={validation ? 'statement-help statement-validation' : 'statement-help'}
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setValidation(''); }} />
      </label>
      <p id="statement-help" className="muted">Required columns: date, description, amount. Use dates like 2026-10-19 and positive amounts like 100.00. Invalid rows are skipped; unreadable files or files with no valid rows fail.</p>
      {validation && <p id="statement-validation" role="alert">{validation}</p>}
      {uploadError != null && <ErrorNotice error={uploadError} />}
      {retrySeconds > 0 && <p role="status">Upload limit reached. Try again in {retrySeconds} seconds.</p>}
      <div><button className="button primary" type="submit" disabled={uploading || polling || retrySeconds > 0}>
        {uploading ? 'Uploading…' : 'Upload statement'}
      </button></div>
    </form>

    {!job && !jobId && <EmptyState title="No statement uploaded yet">Your latest upload and its actual processing result will appear here.</EmptyState>}
    {jobId && <div className="stack" aria-live="polite" aria-atomic="true">
      <h3>{job?.fileName ?? 'Checking your previous upload'}</h3>
      <p><span className="tag">{job?.status ?? 'Checking status'}</span>{polling ? ' · Checking for updates…' : ''}</p>
      {job && <dl className="form-grid">
        <div><dt>Rows read</dt><dd>{job.totalRows}</dd></div>
        <div><dt>Imported rows</dt><dd>{job.importedRows}</dd></div>
        <div><dt>Invalid rows</dt><dd>{job.invalidRows}</dd></div>
      </dl>}
      {job?.status === 'COMPLETED' && <p role="status">Import complete. {job.importedRows} expense{job.importedRows === 1 ? '' : 's'} saved; {job.invalidRows} invalid row{job.invalidRows === 1 ? '' : 's'} skipped.</p>}
      {job?.status === 'FAILED' && <p className="notice" role="alert">Import failed. {job.errorMessage || 'No expenses were saved. Check the statement and upload it again.'}</p>}
      {pollError != null && <ErrorNotice error={pollError} />}
      {paused && <div className="stack">
        <p className="muted">Automatic checks are paused. Processing may still continue in the background; this does not cancel the import.</p>
        <div><button className="button secondary" type="button" onClick={() => setPollAttempt((attempt) => attempt + 1)}>Check status again</button></div>
      </div>}
    </div>}
  </section>;
}
