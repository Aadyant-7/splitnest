import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../app/SessionContext';
import { api } from '../../shared/api/client';
import type { GroupSummary, User } from '../../shared/api/types';
import { ErrorNotice, Loading } from '../../shared/ui/Feedback';
import { WorkflowIllustration } from './WorkflowIllustration';
import './home.css';

export function HomePage() {
  const { user } = useSession();
  // Reset request state when accounts change, including a response that arrives after sign-out.
  return user ? <HomeWorkspace key={user.id} user={user} /> : <Loading label="Loading your workspace…" />;
}

function HomeWorkspace({ user }: { user: User }) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const ready = !loading && !error;

  useEffect(() => {
    const request = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    void api<GroupSummary[]>('/groups', { signal: request.signal })
      .then((result) => { if (active) setGroups(result); })
      .catch((failure: unknown) => { if (active && !request.signal.aborted) setError(failure); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; request.abort(); };
  }, [retry]);

  return <div className="home-page">
    <header className="home-hero">
      <div className="home-intro">
        <p className="home-eyebrow">Your workspace</p>
        <h1>Welcome, {user.displayName}</h1>
        <p className="home-lead">A household, a trip, a shared meal. Keep the expenses together and see everyone’s share.</p>
        <div className="home-hero-actions"><Link className="button primary" to="/app/groups#create-group">Create a group <span aria-hidden="true">↗</span></Link><Link className="home-light-link" to="/app/guide">New here? Take a quick tour <span aria-hidden="true">→</span></Link></div>
        {ready && <dl className="home-account-summary" aria-label="Your group summary">
          <div><dt>Groups you belong to</dt><dd>{groups.length}</dd></div>
          <div><dt>Groups you manage</dt><dd>{groups.filter((group) => group.role === 'ADMIN').length}</dd></div>
        </dl>}
      </div>
      <div className="home-hero-visual"><WorkflowIllustration /></div>
    </header>

    <div className="home-content-grid">
      <section className="home-groups" aria-labelledby="home-groups-heading">
        <div className="home-section-heading"><div><p className="home-eyebrow">Your shared spaces</p><h2 id="home-groups-heading">Your groups</h2></div><Link className="text-link" to="/app/groups">View all groups <span aria-hidden="true">→</span></Link></div>
        {loading ? <div className="home-state"><Loading label="Loading your groups…" /></div> : error ? <div className="home-state home-error"><ErrorNotice error={error} /><button className="button secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Try loading groups again</button></div> : groups.length === 0 ? <div className="home-empty">
          <svg className="home-empty-drawing" viewBox="0 0 120 112" fill="none" aria-hidden="true"><rect x="24" y="15" width="73" height="82" rx="9" fill="#e8f0ed" transform="rotate(9 24 15)" /><rect x="12" y="10" width="73" height="82" rx="9" fill="#fff" stroke="#aec8c1" strokeWidth="1.5" /><circle cx="49" cy="37" r="11" fill="#b7d8cb" /><path d="M30 66c0-17 38-17 38 0" fill="#b7d8cb" /><path d="M34 78h29" stroke="#ceddd7" strokeWidth="3" strokeLinecap="round" /><circle cx="88" cy="80" r="16" fill="#eedeb8" /><path d="M88 73v14m-7-7h14" stroke="#7c6940" strokeWidth="2" strokeLinecap="round" /></svg>
          <div><h3>Your first group starts here</h3><p>Create one for the people you share costs with. Already joining someone? Ask their admin to add your registered email.</p><Link className="text-link" to="/app/groups#create-group">Set up your first group <span aria-hidden="true">→</span></Link></div>
        </div> : <ul className="home-group-list">{groups.slice(0, 3).map((group) => <li key={group.id}><Link to={`/app/groups/${group.id}`} className="home-group-link"><span className="home-group-avatar" aria-hidden="true">{group.name.slice(0, 1).toUpperCase()}</span><span className="home-group-copy"><strong>{group.name}</strong><span>{group.role === 'ADMIN' ? 'You manage this group' : 'You’re a member'}</span></span><span className="home-group-arrow" aria-hidden="true">↗</span></Link></li>)}</ul>}
        {ready && groups.length > 3 && <p className="home-list-note">Showing 3 of {groups.length} groups. Open all groups to choose another.</p>}
      </section>

      <aside className="home-next" aria-labelledby="home-next-heading">
        <p className="home-eyebrow">A useful next step</p><h2 id="home-next-heading">{ready && groups.length === 0 ? 'Start with your people' : 'Make your next expense count'}</h2>
        <p>{ready && groups.length === 0 ? 'Create a group, then add people from its Members section. Everyone needs their own SplitNest account.' : 'Open a group and choose Expenses. Record who paid, the amount and the date; SplitNest saves everyone’s equal share.'}</p>
        <Link className="text-link" to={ready && groups.length > 0 ? `/app/groups/${groups[0].id}?tab=expenses` : '/app/groups#create-group'}>{ready && groups.length > 0 ? 'Open a group' : 'Create your group'} <span aria-hidden="true">→</span></Link>
        <div className="home-next-foot"><span>Tip</span><p>{ready && groups.length > 0 ? 'Open a saved expense’s details to review each member’s exact share.' : 'Once added, a group appears on each member’s My groups page.'}</p></div>
      </aside>
    </div>

    <section className="home-discover" aria-labelledby="home-discover-heading">
      <div className="home-discover-heading"><p className="home-eyebrow">Inside every group</p><h2 id="home-discover-heading">More than an expense list</h2><p>Choose a group to find these tools in its navigation.</p></div>
      <div className="home-tool-links">
        <Link to="/app/guide#balances"><span className="home-tool-number" aria-hidden="true">01</span><div><h3>Know where you stand</h3><p>See what each person paid, their share and their net balance.</p></div><span aria-hidden="true">↗</span></Link>
        <Link to="/app/guide#imports"><span className="home-tool-number" aria-hidden="true">02</span><div><h3>Skip the repeated typing</h3><p>Import several expenses from a CSV or XLSX statement.</p></div><span aria-hidden="true">↗</span></Link>
        <Link to="/app/guide#budgets"><span className="home-tool-number" aria-hidden="true">03</span><div><h3>Keep category limits in view</h3><p>Set monthly budgets and review alerts from the daily check.</p></div><span aria-hidden="true">↗</span></Link>
      </div>
    </section>
  </div>;
}
