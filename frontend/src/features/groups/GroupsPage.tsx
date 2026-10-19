import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession } from '../../app/SessionContext';
import { api } from '../../shared/api/client';
import type { Group, GroupSummary } from '../../shared/api/types';
import { EmptyState, ErrorNotice, Loading } from '../../shared/ui/Feedback';
import { shortDate } from '../../shared/ui/format';

export function GroupsPage() {
  const { user } = useSession();
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
      <header className="page-heading"><div><p className="eyebrow">A LITTLE MORE TOGETHER</p><h1>Your groups</h1><p className="muted">{user?.displayName ? `Hi ${user.displayName}. ` : ''}One place for shared expenses, clear balances and fewer awkward reminders.</p></div><span className="tag">Equal shares. Clear heads.</span></header>
      <section className="panel stack" aria-labelledby="groups-heading">
        <div className="section-heading"><h2 id="groups-heading">Your shared spaces</h2>{!loading && !loadError && <span className="tag">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>}</div>
        {loading ? <Loading label="Loading your groups…" /> : loadError ? (
          <div className="stack"><ErrorNotice error={loadError} /><div><button className="button secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Try loading groups again</button></div></div>
        ) : groups.length === 0 ? (
          <EmptyState title="Good things start with a group">Create a space for your flatmates, family or next trip below.</EmptyState>
        ) : (
          <div className="form-grid">{groups.map((group) => (
            <article className="panel stack" key={group.id}>
              <div className="section-heading"><span className="avatar" aria-hidden="true">{group.name.slice(0, 1).toUpperCase()}</span><span className="tag">{group.role === 'ADMIN' ? 'Admin' : 'Member'}</span></div>
              <h3><Link to={`/app/groups/${group.id}`}>{group.name}</Link></h3>
              <p className="muted">Created {shortDate(group.createdAt)}</p>
              <Link className="button secondary" to={`/app/groups/${group.id}`}>Open {group.name}<span aria-hidden="true"> ↗</span></Link>
            </article>
          ))}</div>
        )}
      </section>
      <section className="panel stack" aria-labelledby={`${formId}-heading`}>
        <div><p className="eyebrow">ROOM FOR EVERYONE</p><h2 id={`${formId}-heading`}>Create a group</h2><p className="muted">You’ll be the admin. Add people who already have a SplitNest account.</p></div>
        <ErrorNotice error={createError} />
        <form className="stack" onSubmit={createGroup}>
          <label className="field" htmlFor={`${formId}-name`}>Group name<input id={`${formId}-name`} required maxLength={120} placeholder="The apartment, Goa weekend…" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div><button type="submit" className="button primary" disabled={creating}>{creating ? 'Creating group…' : 'Create group'}</button></div>
        </form>
      </section>
    </div>
  );
}
