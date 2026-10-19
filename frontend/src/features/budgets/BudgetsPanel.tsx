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
      setAmount('');
      setSuccess(`${categoryName(saved.category)} budget saved.`);
    } catch (error) {
      if (mounted.current && !request.signal.aborted) setSaveError(error);
    } finally {
      if (mounted.current && !request.signal.aborted) setSaving(false);
    }
  }

  return <section className="panel stack" aria-labelledby="budgets-heading">
    <div>
      <p className="eyebrow">Plan together</p>
      <h2 id="budgets-heading">Budgets & alerts</h2>
      <p className="muted">Category limits are checked daily at 00:00 UTC. Alerts capture spending when a limit is first exceeded in a month; they are not live spending totals or an immediate check after saving.</p>
    </div>
    {loading ? <Loading label="Loading budgets and alerts…" /> : loadError != null ? <div className="stack">
      <ErrorNotice error={loadError} />
      <div><button className="button secondary" type="button" onClick={() => setReload((value) => value + 1)}>Retry budgets and alerts</button></div>
    </div> : <>
      {isAdmin ? <form className="stack" onSubmit={save} noValidate aria-label="Category budget">
        <div className="form-grid">
          <label className="field" htmlFor="budget-category"><span>Category</span>
            <select id="budget-category" value={category} disabled={saving}
              onChange={(event) => chooseCategory(event.target.value as Category)}>
              {categories.map((option) => <option key={option} value={option}>{categoryName(option)}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="budget-amount"><span>Monthly limit (INR)</span>
            <input ref={amountInput} id="budget-amount" type="text" inputMode="decimal" placeholder="For example, 5000.00"
              value={amount} disabled={saving} aria-describedby={validation ? 'budget-validation' : undefined}
              aria-invalid={Boolean(validation)} onChange={(event) => { setAmount(event.target.value); setValidation(''); setSuccess(''); }} />
          </label>
        </div>
        {validation && <p id="budget-validation" role="alert">{validation}</p>}
        {saveError != null && <ErrorNotice error={saveError} />}
        {success && <p role="status">{success}</p>}
        <div><button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save monthly limit'}</button></div>
      </form> : <p className="muted">Only group admins can change category limits.</p>}

      {budgets.length === 0 ? <EmptyState title="No category budgets yet">
        {isAdmin ? 'Add a category limit to enable scheduled budget checks.' : 'An admin can set category limits for this group.'}
      </EmptyState> : <div className="table-wrap"><table className="table">
        <caption>Monthly category limits</caption>
        <thead><tr><th scope="col">Category</th><th scope="col">Monthly limit</th>{isAdmin && <th scope="col">Action</th>}</tr></thead>
        <tbody>{budgets.map((budget) => <tr key={budget.id}>
          <th scope="row">{categoryName(budget.category)}</th><td>{money(budget.monthlyLimit)}</td>
          {isAdmin && <td><button className="button secondary" type="button" disabled={saving}
            aria-label={`Edit ${categoryName(budget.category)} budget`}
            onClick={() => { chooseCategory(budget.category); amountInput.current?.focus(); }}>Edit</button></td>}
        </tr>)}</tbody>
      </table></div>}

      <h3>Budget alerts</h3>
      {alerts.length === 0 ? <EmptyState title="No budget alerts yet">An alert appears after a scheduled check finds spending strictly above a category limit.</EmptyState>
        : <div className="table-wrap"><table className="table">
          <caption>Recorded budget alert snapshots</caption>
          <thead><tr><th scope="col">Month</th><th scope="col">Category</th><th scope="col">Spent at detection</th><th scope="col">Limit at detection</th><th scope="col">Detected</th></tr></thead>
          <tbody>{alerts.map((alert) => <tr key={alert.id}><td>{shortDate(alert.month)}</td>
            <th scope="row">{categoryName(alert.category)}</th><td>{money(alert.spent)}</td>
            <td>{money(alert.monthlyLimit)}</td><td>{shortDate(alert.createdAt)}</td></tr>)}</tbody>
        </table></div>}
    </>}
  </section>;
}
