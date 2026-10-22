import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useSession } from '../../app/SessionContext';
import { api } from '../../shared/api/client';
import type { Balance, ExpensePage, Group } from '../../shared/api/types';
import { ErrorNotice, Loading } from '../../shared/ui/Feedback';
import { money, moneySign } from '../../shared/ui/format';
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
  const tabsId = useId();
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const refresh = () => setRevision((value) => value + 1);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next]);
    tabButtons.current[next]?.focus();
  }

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
  const ownSign = ownBalance ? moneySign(ownBalance.netBalance) : 0;

  return (
    <div className="stack">
      <header className="page-heading group-heading">
        <div><Link className="muted" to="/app/groups">All groups</Link><h1>{group.name}</h1><p className="group-meta muted">{group.members.length} {group.members.length === 1 ? 'member' : 'members'} <span aria-hidden="true">·</span> {isAdmin ? 'Admin' : 'Member'} <span aria-hidden="true">·</span> INR</p></div>
      </header>
      <div className="group-tabs" role="tablist" aria-label="Group sections">{tabs.map((item, index) => <button className={`group-tab${tab === item ? ' is-active' : ''}`} key={item} type="button" role="tab" id={`${tabsId}-tab-${item}`} aria-selected={tab === item} aria-controls={`${tabsId}-panel-${item}`} tabIndex={tab === item ? 0 : -1} ref={(element) => { tabButtons.current[index] = element; }} onClick={() => setTab(item)} onKeyDown={(event) => navigateTabs(event, index)}>{item}</button>)}</div>
      {loading && <p className="muted" role="status">Refreshing group details…</p>}
      <ErrorNotice error={error} />
      {tabs.map((item) => <div key={item} className="group-tabpanel stack" role="tabpanel" id={`${tabsId}-panel-${item}`} aria-labelledby={`${tabsId}-tab-${item}`} hidden={tab !== item} tabIndex={0}>
      {tab === item && <>
      {tab === 'Overview' && <>
        <div className="overview-grid">
          <section className="panel balance-summary"><div><p className="summary-label">Your net balance</p><h2 className={`summary-value ${ownSign > 0 ? 'balance-positive' : ownSign < 0 ? 'balance-negative' : ''}`}>{money(ownBalance?.netBalance ?? 0)}</h2><p className="summary-copy muted">{ownSign > 0 ? 'You’re owed by this group.' : ownSign < 0 ? 'You owe the group.' : 'You have no amount owed.'}</p></div><div className="summary-actions"><button className="button primary" type="button" onClick={() => setTab('Expenses')}>Add expense</button></div></section>
          <section className="panel expense-count"><p className="summary-label">Expense history</p><h2>{expenses.totalElements} {expenses.totalElements === 1 ? 'expense' : 'expenses'}</h2><button className="button secondary" type="button" onClick={() => setTab('Expenses')}>View expenses</button></section>
        </div>
        <BalancePanel balances={balances} currentUserId={user.id} />
      </>}
      {tab === 'Expenses' && <ExpensesPanel groupId={groupId} members={group.members} balances={balances} expenses={expenses} currentUserId={user.id} isAdmin={isAdmin} onPageChange={setPage} onChanged={refresh} />}
      {tab === 'Members' && <MembersPanel groupId={groupId} members={group.members} currentUserId={user.id} isAdmin={isAdmin} onChanged={refresh} />}
      {tab === 'Imports' && <ImportsPanel groupId={groupId} onImported={refresh} />}
      {tab === 'Budgets' && <BudgetsPanel groupId={groupId} isAdmin={isAdmin} />}
      </>}
      </div>)}
    </div>
  );
}
