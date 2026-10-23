import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../../shared/api/client';
import type { Group, GroupSummary } from '../../shared/api/types';
import { ErrorNotice, Loading } from '../../shared/ui/Feedback';
import { shortDate } from '../../shared/ui/format';
import './group-journeys.css';

function FirstGroupIllustration() {
  return <svg className="first-group-illustration" viewBox="0 0 288 152" fill="none" aria-hidden="true" focusable="false">
    <path d="M20 124h248" stroke="#cedfdc" strokeWidth="2" strokeLinecap="round" />
    <rect x="76" y="23" width="136" height="102" rx="12" fill="#fff" stroke="#9fbeb9" strokeWidth="2" />
    <rect x="90" y="38" width="48" height="8" rx="4" fill="#b6d8cc" />
    <path d="M91 62h106M91 79h71M91 96h87" stroke="#d5e3e0" strokeWidth="5" strokeLinecap="round" />
    <circle cx="55" cy="77" r="17" fill="#f6dfb9" stroke="#d5b888" strokeWidth="2" />
    <path d="M29 124v-11c0-14 11-24 26-24s26 10 26 24v11" fill="#d1e4dc" stroke="#91b4a6" strokeWidth="2" />
    <circle cx="231" cy="77" r="17" fill="#dfdff0" stroke="#b5b3cf" strokeWidth="2" />
    <path d="M205 124v-11c0-14 11-24 26-24s26 10 26 24v11" fill="#dae5ee" stroke="#a2b9cb" strokeWidth="2" />
    <circle cx="144" cy="111" r="20" fill="#245e51" />
    <path d="M135 111l6 6 12-13" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M48 30v10m-5-5h10M239 36v8m-4-4h8" stroke="#b4cfc5" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

export function GroupsPage() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const formId = useId();
  const createPanel = useRef<HTMLElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [createError, setCreateError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (hash !== '#create-group') return;
    nameInput.current?.focus({ preventScroll: true });
    createPanel.current?.scrollIntoView?.({ block: 'start' });
  }, [hash]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError(null);
    api<GroupSummary[]>('/groups', { signal: controller.signal })
      .then((result) => { if (active) setGroups(result); })
      .catch((failure: unknown) => { if (active) setLoadError(failure); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [retry]);

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setCreateError(new Error('Give your group a name.'));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const group = await api<Group>('/groups', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      navigate(`/app/groups/${group.id}`);
    } catch (failure) {
      setCreateError(failure);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-heading"><div><h1>Your groups</h1><p className="muted">Choose a group to view its expenses and balances.</p></div>{!loading && !loadError && <span className="tag">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>}</header>
      <div className="groups-layout">
      <section className="stack" aria-label="Your groups">
        {loading ? <Loading label="Loading your groups…" /> : loadError ? (
          <div className="stack"><ErrorNotice error={loadError} /><div><button className="button secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Try loading groups again</button></div></div>
        ) : groups.length === 0 ? (
          <section className="first-group panel" aria-labelledby={`${formId}-empty-heading`}>
            <FirstGroupIllustration />
            <div className="first-group-copy"><h2 id={`${formId}-empty-heading`}>No groups yet</h2><p className="muted">Start with the people you share expenses with. Groups you create or are added to will appear here.</p></div>
            <ol className="group-setup-steps">
              <li><span className="group-step-number" aria-hidden="true">1</span><div><h3>Create your group</h3><p>Name your household, trip or shared activity.</p></div></li>
              <li><span className="group-step-number" aria-hidden="true">2</span><div><h3>Add your people</h3><p>As admin, add registered users by their account email.</p></div></li>
              <li><span className="group-step-number" aria-hidden="true">3</span><div><h3>Record an expense</h3><p>Choose who paid. SplitNest divides it equally and updates everyone’s balance.</p></div></li>
            </ol>
            <div className="inline-actions"><Link className="button secondary" to="#create-group" onClick={() => nameInput.current?.focus()}>Name your first group</Link><Link className="text-link" to="/app/guide">See the app guide</Link></div>
          </section>
        ) : (
          <div className="group-grid">{groups.map((group) => (
            <Link className="group-card" key={group.id} to={`/app/groups/${group.id}`} aria-labelledby={`${formId}-${group.id}-name`}>
              <div className="group-card-heading"><span className="avatar" aria-hidden="true">{group.name.slice(0, 1).toUpperCase()}</span><span className="tag">{group.role === 'ADMIN' ? 'Admin' : 'Member'}</span></div>
              <h2 id={`${formId}-${group.id}-name`}>{group.name}</h2>
              <div className="group-card-footer"><p className="muted">Created {shortDate(group.createdAt)}</p><span className="group-card-open" aria-hidden="true">Open group <span>↗</span></span></div>
            </Link>
          ))}</div>
        )}
      </section>
      <section id="create-group" ref={createPanel} tabIndex={-1} className="panel stack create-group-panel" aria-labelledby={`${formId}-heading`}>
        <div><h2 id={`${formId}-heading`}>Create a group</h2><p className="muted">You’ll be its admin. Add other registered users after creating it.</p></div>
        <ErrorNotice error={createError} />
        <form className="stack" onSubmit={createGroup}>
          <label className="field" htmlFor={`${formId}-name`}>Group name<input id={`${formId}-name`} ref={nameInput} required maxLength={120} placeholder="e.g. Apartment expenses" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div><button type="submit" className="button primary" disabled={creating}>{creating ? 'Creating group…' : 'Create group'}</button></div>
        </form>
        <p className="group-create-tip">Already sharing with someone? Ask their group admin to add your registered email.</p>
      </section>
      </div>
    </div>
  );
}
