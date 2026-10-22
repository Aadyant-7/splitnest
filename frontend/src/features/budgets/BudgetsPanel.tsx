import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { categories, type Budget, type BudgetAlert, type Category } from '../../shared/api/types';
import { EmptyState, ErrorNotice, Loading } from '../../shared/ui/Feedback';
import { decimalAmount, money, shortDate } from '../../shared/ui/format';

function categoryName(category: Category) {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

export function BudgetsPanel({ groupId, isAdmin }: { groupId: string; isAdmin: boolean }) {
  return <BudgetWorkspace key={groupId} groupId={groupId} isAdmin={isAdmin} />;
}

function BudgetWorkspace({ groupId, isAdmin }: { groupId: string; isAdmin: boolean }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [category, setCategory] = useState<Category>('FOOD');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [validation, setValidation] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
  const amountInput = useRef<HTMLInputElement>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const selectedBudget = budgets.find((budget) => budget.category === category);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    const request = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      api<Budget[]>(`/groups/${groupId}/budgets`, { signal: request.signal }),
      api<BudgetAlert[]>(`/groups/${groupId}/alerts`, { signal: request.signal }),
    ]).then(([limits, snapshots]) => {
      if (!active) return;
      setBudgets(limits);
      setAlerts(snapshots);
      const initialBudget = limits.find((budget) => budget.category === 'FOOD');
      setCategory('FOOD');
      setAmount(initialBudget ? decimalAmount(initialBudget.monthlyLimit) : '');
    }).catch((error: unknown) => {
      if (active && !request.signal.aborted) setLoadError(error);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; request.abort(); };
  }, [groupId, reload]);

  function chooseCategory(next: Category) {
    setCategory(next);
    const existing = budgets.find((budget) => budget.category === next);
    setAmount(existing ? decimalAmount(existing.monthlyLimit) : '');
    setValidation('');
    setSuccess('');
    setSaveError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || saving) return;
    setValidation('');
    setSuccess('');
    setSaveError(null);
    const decimal = amount.trim();
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(decimal) || /^0(?:\.0{1,2})?$/.test(decimal)) {
      setValidation('Enter a positive INR amount with up to 10 integer digits and two decimal places.');
      return;
    }
    const request = new AbortController();
    saveRequest.current = request;
    setSaving(true);
    try {
      // Keep the decimal as text; the backend owns exact financial arithmetic.
      const saved = await api<Budget>(`/groups/${groupId}/budgets/${category}`, {
        method: 'PUT', body: JSON.stringify({ monthlyLimit: decimal }), signal: request.signal,
      });
      if (!mounted.current || request.signal.aborted) return;
      setBudgets((previous) => [...previous.filter((budget) => budget.category !== saved.category), saved]
        .sort((left, right) => categories.indexOf(left.category) - categories.indexOf(right.category)));
      setAmount(decimalAmount(saved.monthlyLimit));
      setSuccess(`${categoryName(saved.category)} budget saved.`);
    } catch (error) {
      if (mounted.current && !request.signal.aborted) setSaveError(error);
    } finally {
      if (mounted.current && !request.signal.aborted) setSaving(false);
    }
  }

  return <section className="stack" aria-labelledby="budgets-heading">
    <header className="section-header"><div>
      <h2 id="budgets-heading">Budgets & alerts</h2>
      <p className="muted">Set a monthly spending limit for each category you want to track.</p>
    </div></header>
    {loading ? <Loading label="Loading budgets and alerts…" /> : loadError != null ? <div className="stack">
      <ErrorNotice error={loadError} />
      <div><button className="button secondary" type="button" onClick={() => setReload((value) => value + 1)}>Retry budgets and alerts</button></div>
    </div> : <>
      <div className={`feature-layout${isAdmin ? '' : ' feature-layout-single'}`}>
        <div className="panel stack feature-main">
          <div className="section-header"><h3>Monthly limits</h3><span className="tag">INR</span></div>
          {budgets.length === 0 ? <EmptyState title="No category budgets yet">
            {isAdmin ? 'Set a limit using the budget form to start tracking a category.' : 'An admin can set category limits for this group.'}
          </EmptyState> : <div className="table-wrap"><table className="table budget-limits-table">
            <caption className="sr-only">Monthly category limits</caption>
            <thead><tr><th scope="col">Category</th><th scope="col" className="number">Monthly limit</th>{isAdmin && <th scope="col"><span className="sr-only">Action</span></th>}</tr></thead>
            <tbody>{budgets.map((budget) => <tr key={budget.id}>
              <th scope="row">{categoryName(budget.category)}</th><td className="number">{money(budget.monthlyLimit)}</td>
              {isAdmin && <td className="table-action"><button className="button secondary" type="button" disabled={saving}
                aria-label={`Edit ${categoryName(budget.category)} budget`}
                onClick={() => { chooseCategory(budget.category); amountInput.current?.focus(); }}>Edit</button></td>}
            </tr>)}</tbody>
          </table></div>}
          {!isAdmin && <p className="muted">Only group admins can change category limits.</p>}
          <p className="info-note">Limits are checked daily at 00:00 UTC. Saving a limit does not run an immediate spending check.</p>
        </div>
        {isAdmin && <form className="panel stack feature-aside budget-editor" onSubmit={save} noValidate aria-label="Category budget">
          <h3>{selectedBudget ? 'Edit monthly limit' : 'Set monthly limit'}</h3>
          <p className="muted">{selectedBudget ? 'Update the saved limit for this category.' : 'Choose a category and enter a monthly limit.'}</p>
          <label className="field" htmlFor="budget-category"><span>Category</span>
            <select id="budget-category" value={category} disabled={saving}
              onChange={(event) => chooseCategory(event.target.value as Category)}>
              {categories.map((option) => <option key={option} value={option}>{categoryName(option)}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="budget-amount"><span>Monthly limit (INR)</span>
            <input ref={amountInput} id="budget-amount" type="text" inputMode="decimal" placeholder="5000.00"
              value={amount} disabled={saving} aria-describedby={validation ? 'budget-amount-help budget-validation' : 'budget-amount-help'}
              aria-invalid={Boolean(validation)} onChange={(event) => { setAmount(event.target.value); setValidation(''); setSuccess(''); }} />
          </label>
          <p id="budget-amount-help" className="muted">Use a positive amount with up to two decimal places.</p>
          {validation && <p id="budget-validation" className="notice error" role="alert">{validation}</p>}
          {saveError != null && <ErrorNotice error={saveError} />}
          {success && <p className="notice success" role="status">{success}</p>}
          <div><button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save monthly limit'}</button></div>
        </form>}
      </div>

      <section className="panel stack" aria-labelledby="budget-alerts-heading">
        <div><h3 id="budget-alerts-heading">Budget alerts</h3>
          <p className="muted">Recorded snapshots from the daily check, not live spending totals. One alert per category per month.</p></div>
        {alerts.length === 0 ? <EmptyState title="No budget alerts yet">An alert appears when a scheduled check finds spending above a category’s monthly limit.</EmptyState>
          : <div className="table-wrap"><table className="table">
            <caption className="sr-only">Recorded budget alert snapshots</caption>
            <thead><tr><th scope="col">Month</th><th scope="col">Category</th><th scope="col" className="number">Spent at detection</th><th scope="col" className="number">Limit at detection</th><th scope="col">Detected</th></tr></thead>
            <tbody>{alerts.map((alert) => <tr key={alert.id}><td>{shortDate(alert.month)}</td>
              <th scope="row">{categoryName(alert.category)}</th><td className="number">{money(alert.spent)}</td>
              <td className="number">{money(alert.monthlyLimit)}</td><td>{shortDate(alert.createdAt)}</td></tr>)}</tbody>
          </table></div>}
      </section>
    </>}
  </section>;
}
