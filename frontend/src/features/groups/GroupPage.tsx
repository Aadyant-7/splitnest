import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSession } from '../../app/SessionContext';
import { api } from '../../shared/api/client';
import type { Balance, ExpensePage, Group } from '../../shared/api/types';
import { ErrorNotice, Loading } from '../../shared/ui/Feedback';
import { money } from '../../shared/ui/format';
import { ImportsPanel } from '../imports/ImportsPanel';
import { BudgetsPanel } from '../budgets/BudgetsPanel';
import { BalancePanel } from '../expenses/BalancePanel';
import { ExpensesPanel } from '../expenses/ExpensesPanel';
import { MembersPanel } from './MembersPanel';

type Workspace = { group: Group; balances: Balance[]; expenses: ExpensePage };
const tabs = ['Overview', 'Expenses', 'Members', 'Imports', 'Budgets'] as const;
type Tab = typeof tabs[number];

export function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useSession();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => { setPage(0); setTab('Overview'); }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const options = { signal: controller.signal };
    Promise.all([
      api<Group>(`/groups/${groupId}`, options),
      api<Balance[]>(`/groups/${groupId}/balances`, options),
      api<ExpensePage>(`/groups/${groupId}/expenses?page=${page}&size=20`, options),
    ]).then(([group, balances, expenses]) => {
      if (!active) return;
      // Deleting the only row on a final page must return the reader to a real page.
      if (page > 0 && expenses.content.length === 0 && page >= expenses.totalPages) {
        setPage(Math.max(0, expenses.totalPages - 1));
        return;
      }
      setWorkspace({ group, balances, expenses });
    }).catch((failure: unknown) => {
      if (active) { setWorkspace(null); setError(failure); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [groupId, page, revision]);

  if (!groupId) return <ErrorNotice error={new Error('Choose a group to continue.')} />;
  if (loading && (!workspace || workspace.group.id !== groupId)) return <Loading label="Opening your group…" />;
  if (!workspace || !user) return <section className="panel stack"><Link to="/app/groups">← Your groups</Link><h1>We couldn’t open this group</h1><ErrorNotice error={error} /><div><button type="button" className="button secondary" onClick={refresh}>Try opening group again</button></div></section>;

  const { group, balances, expenses } = workspace;
  const isAdmin = group.members.some((member) => member.userId === user.id && member.role === 'ADMIN');
  const ownBalance = balances.find((balance) => balance.userId === user.id);

  return (
    <div className="stack">
      <header className="page-heading">
        <div><Link className="muted" to="/app/groups">← Your groups</Link><p className="eyebrow">YOUR SHARED SPACE</p><h1>{group.name}</h1><p className="muted">Every shared expense, everyone on the same page.</p></div>
        <span className="tag">{isAdmin ? 'Admin' : 'Member'} · INR</span>
      </header>
      <nav className="section-heading" aria-label="Group sections">{tabs.map((item) => <button className={`button ${tab === item ? 'primary' : 'secondary'}`} key={item} type="button" aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {loading && <p className="muted" role="status">Refreshing group details…</p>}
      <ErrorNotice error={error} />
      {tab === 'Overview' && <>
        <div className="form-grid">
          <section className="panel stack"><p className="eyebrow">YOUR NET BALANCE</p><h2 className={ownBalance && ownBalance.netBalance > 0 ? 'balance-positive' : ownBalance && ownBalance.netBalance < 0 ? 'balance-negative' : ''}>{money(ownBalance?.netBalance ?? 0)}</h2><p className="muted">{ownBalance && ownBalance.netBalance > 0 ? 'Your group owes you.' : ownBalance && ownBalance.netBalance < 0 ? 'Your share is owed to the group.' : 'You’re all even.'}</p></section>
          <section className="panel stack"><p className="eyebrow">IN THIS TOGETHER</p><h2>{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</h2><button className="button secondary" type="button" onClick={() => setTab('Members')}>See members</button></section>
          <section className="panel stack"><p className="eyebrow">RECORDED & SHARED</p><h2>{expenses.totalElements} {expenses.totalElements === 1 ? 'expense' : 'expenses'}</h2><button className="button primary" type="button" onClick={() => setTab('Expenses')}>Manage expenses</button></section>
        </div>
        <BalancePanel balances={balances} currentUserId={user.id} />
      </>}
      {tab === 'Expenses' && <ExpensesPanel groupId={groupId} members={group.members} balances={balances} expenses={expenses} currentUserId={user.id} isAdmin={isAdmin} onPageChange={setPage} onChanged={refresh} />}
      {tab === 'Members' && <MembersPanel groupId={groupId} members={group.members} currentUserId={user.id} isAdmin={isAdmin} onChanged={refresh} />}
      {tab === 'Imports' && <ImportsPanel groupId={groupId} onImported={refresh} />}
      {tab === 'Budgets' && <BudgetsPanel groupId={groupId} isAdmin={isAdmin} />}
    </div>
  );
}
