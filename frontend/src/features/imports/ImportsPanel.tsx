import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { api, ApiError } from '../../shared/api/client';
import type { ImportJob } from '../../shared/api/types';
import { ErrorNotice } from '../../shared/ui/Feedback';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const POLL_INTERVAL_MS = 2_000;
const AUTO_POLL_DURATION_MS = 2 * 60_000;
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

const statusDescriptions: Record<ImportJob['status'], string> = {
  PENDING: 'Your statement is queued. You can leave this tab while it processes.',
  PROCESSING: 'Reading your statement and saving valid expenses. You can leave this tab.',
  COMPLETED: 'The expenses are available in this group’s expense list.',
  FAILED: 'Review the file format and upload a corrected statement.',
};

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
  // Remember notification separately so revisiting a completed result does not refresh the group again.
  const completedJob = useRef<string | null>(rememberedJob(`${storageKey}:notified`));
  const onImportedRef = useRef(onImported);
  const fileInput = useRef<HTMLInputElement>(null);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1_000));
  const terminal = job?.status === 'COMPLETED' || job?.status === 'FAILED';

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
          if (updated.status === 'COMPLETED' && completedJob.current !== updated.id) {
            completedJob.current = updated.id;
            rememberJob(`${storageKey}:notified`, updated.id);
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
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          rememberJob(storageKey, null);
          rememberJob(`${storageKey}:notified`, null);
          completedJob.current = null;
          setJobId(null);
          setJob(null);
          setPaused(false);
          return;
        }
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
      completedJob.current = null;
      rememberJob(`${storageKey}:notified`, null);
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

  return <section className="stack" aria-labelledby="imports-heading">
    <header className="section-header">
      <div><h2 id="imports-heading">Import expenses</h2>
        <p className="muted">Add several expenses from a statement instead of entering them individually.</p></div>
    </header>
    <div className="feature-layout">
      <div className="panel stack feature-main">
        <h3>Upload a statement</h3>
        <form className="stack" onSubmit={upload} noValidate>
          <div className="file-picker">
            <label className="field" htmlFor="statement-file">
              <span>Statement file</span>
              <input ref={fileInput} id="statement-file" type="file" accept=".csv,.xlsx" disabled={uploading || polling}
                aria-invalid={Boolean(validation)} aria-describedby={validation ? 'statement-help statement-validation' : 'statement-help'}
                onChange={(event) => { setFile(event.target.files?.[0] ?? null); setValidation(''); setUploadError(null); }} />
            </label>
            <p id="statement-help" className="file-picker-meta muted">CSV or XLSX · Maximum 5 MiB</p>
          </div>
          <p className="info-note">Each imported expense is paid by you and split equally among the group’s members when saved.</p>
          {validation && <p id="statement-validation" className="notice error" role="alert">{validation}</p>}
          {uploadError != null && <ErrorNotice error={uploadError} />}
          {retrySeconds > 0 && <p role="status">Upload limit reached. Try again in {retrySeconds} seconds.</p>}
          <div><button className="button primary" type="submit" disabled={uploading || polling || retrySeconds > 0}>
            {uploading ? 'Uploading…' : 'Upload statement'}
          </button></div>
          {polling && <p className="muted">Wait for this upload to finish before starting another.</p>}
        </form>
      </div>
      <aside className="panel stack feature-aside" aria-labelledby="statement-format-heading">
        <h3 id="statement-format-heading">Prepare your file</h3>
        <p className="muted">Use these three column headings in the first row:</p>
        <code className="format-preview">date,description,amount</code>
        <ul className="format-rules">
          <li>Dates: <code>YYYY-MM-DD</code></li>
          <li>Amounts: positive INR values, such as <code>100.00</code></li>
          <li>CSV files must use UTF-8 encoding.</li>
        </ul>
        <p className="muted">Invalid rows are skipped. An unreadable file or a file with no valid rows fails.</p>
        <a className="text-link" href="/examples/statement.csv" download="splitnest-statement-example.csv">Download sample CSV</a>
        <details className="format-details"><summary>View sample rows</summary>
          <pre className="format-preview">{'date,description,amount\n2026-10-22,BIGBASKET groceries,1250.00\n2026-10-22,ZOMATO dinner,360.00'}</pre>
        </details>
      </aside>
    </div>

    {pollError != null && <ErrorNotice error={pollError} />}
    {!job && !jobId && <div className="panel stack"><h3>No recent upload in this tab</h3><p className="muted">Choose a file above. This tab remembers the latest upload for this account and group.</p></div>}
    {jobId && <section className="panel stack import-result" aria-live="polite" aria-atomic="true" aria-labelledby="import-result-heading">
      <div className="section-header"><div><h3 id="import-result-heading">{job?.fileName ?? 'Checking your previous upload'}</h3>
        <p className="muted">{job ? statusDescriptions[job.status] : 'Looking up the last upload for this group.'}</p></div>
        <span className={`status-tag status-${job?.status.toLowerCase() ?? 'pending'}`}>{job?.status ?? 'Checking status'}</span></div>
      {job && terminal && <dl className="import-counts">
        <div><dt>Rows read</dt><dd>{job.totalRows}</dd></div>
        <div><dt>Imported rows</dt><dd>{job.importedRows}</dd></div>
        <div><dt>Invalid rows</dt><dd>{job.invalidRows}</dd></div>
      </dl>}
      {job?.status === 'COMPLETED' && <p className="notice success" role="status">Import complete. {job.importedRows} expense{job.importedRows === 1 ? '' : 's'} saved; {job.invalidRows} invalid row{job.invalidRows === 1 ? '' : 's'} skipped.</p>}
      {job?.status === 'FAILED' && <p className="notice error" role="alert">Import failed. {job.errorMessage || 'No expenses were saved. Check the statement and upload it again.'}</p>}
      {paused && <div className="stack">
        <p className="muted">Automatic checks are paused. The import may still be processing; this does not cancel it.</p>
        <div><button className="button secondary" type="button" onClick={() => setPollAttempt((attempt) => attempt + 1)}>Check status again</button></div>
      </div>}
    </section>}
  </section>;
}
