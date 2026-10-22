import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../shared/api/client';
import type { Group, GroupSummary } from '../../shared/api/types';
import { EmptyState, ErrorNotice, Loading } from '../../shared/ui/Feedback';
import { shortDate } from '../../shared/ui/format';

export function GroupsPage() {
  const navigate = useNavigate();
  const formId = useId();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [createError, setCreateError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

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
          <EmptyState title="No groups yet">Create a group for your household or trip. If someone adds you to a group, it will appear here.</EmptyState>
        ) : (
          <div className="group-grid">{groups.map((group) => (
            <Link className="group-card" key={group.id} to={`/app/groups/${group.id}`} aria-labelledby={`${formId}-${group.id}-name`}>
              <div className="group-card-heading"><span className="avatar" aria-hidden="true">{group.name.slice(0, 1).toUpperCase()}</span><span className="tag">{group.role === 'ADMIN' ? 'Admin' : 'Member'}</span></div>
              <h2 id={`${formId}-${group.id}-name`}>{group.name}</h2>
              <p className="group-card-footer muted">Created {shortDate(group.createdAt)}</p>
            </Link>
          ))}</div>
        )}
      </section>
      <section className="panel stack create-group-panel" aria-labelledby={`${formId}-heading`}>
        <div><h2 id={`${formId}-heading`}>Create a group</h2><p className="muted">You’ll be its admin. Add other registered users after creating it.</p></div>
        <ErrorNotice error={createError} />
        <form className="stack" onSubmit={createGroup}>
          <label className="field" htmlFor={`${formId}-name`}>Group name<input id={`${formId}-name`} required maxLength={120} placeholder="e.g. Apartment expenses" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div><button type="submit" className="button primary" disabled={creating}>{creating ? 'Creating group…' : 'Create group'}</button></div>
        </form>
      </section>
      </div>
    </div>
  );
}
