import { useId, useState, type FormEvent } from 'react';
import { api } from '../../shared/api/client';
import { categories, type Category, type Member } from '../../shared/api/types';
import { ErrorNotice } from '../../shared/ui/Feedback';

type Props = {
  groupId: string;
  members: Member[];
  currentUserId: string;
  onCreated: () => void;
};

export function ExpenseForm({ groupId, members, currentUserId, onCreated }: Props) {
  const formId = useId();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('FOOD');
  const [expenseDate, setExpenseDate] = useState(() => {
    const today = new Date();
    // The date input represents the user's calendar day, not the UTC day.
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const selectedPayer = members.some((member) => member.userId === paidBy)
    ? paidBy : (members[0]?.userId ?? '');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const decimalAmount = amount.trim();
    // Preserve the entered decimal for BigDecimal rather than calculating money in JavaScript.
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(decimalAmount)
        || !/[1-9]/.test(decimalAmount)) {
      setError(new Error('Enter an amount from ₹0.01 to ₹9,999,999,999.99 with at most two decimal places.'));
      return;
    }
    if (!description.trim() || !selectedPayer) {
      setError(new Error('Add a description and choose a current group member as the payer.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/groups/${groupId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({ amount: decimalAmount, description: description.trim(), category, expenseDate, paidBy: selectedPayer }),
      });
      setAmount('');
      setDescription('');
      setSaved(true);
      onCreated();
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel stack expense-form" aria-labelledby={`${formId}-heading`}>
      <div className="section-heading">
        <div><h2 id={`${formId}-heading`}>Add an expense</h2></div>
      </div>
      <p className="muted" id={`${formId}-split`}>Split equally between {members.length} current {members.length === 1 ? 'member' : 'members'}.</p>
      <ErrorNotice error={error} />
      {saved && <p className="notice" role="status">Expense added. Your group balances are updating.</p>}
      <form className="stack" aria-describedby={`${formId}-split`} onSubmit={submit}>
        <div className="form-grid">
          <label className="field" htmlFor={`${formId}-amount`}>Amount (INR)
            <input id={`${formId}-amount`} inputMode="decimal" placeholder="0.00" required maxLength={13} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="field field-wide" htmlFor={`${formId}-description`}>Description
            <input id={`${formId}-description`} required maxLength={500} placeholder="e.g. Weekly groceries" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="field" htmlFor={`${formId}-category`}>Category
            <select id={`${formId}-category`} value={category} onChange={(event) => setCategory(event.target.value as Category)}>
              {categories.map((item) => <option key={item} value={item}>{categoryName(item)}</option>)}
            </select>
          </label>
          <label className="field field-wide" htmlFor={`${formId}-date`}>Expense date
            <input id={`${formId}-date`} type="date" required value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
          </label>
          <label className="field" htmlFor={`${formId}-payer`}>Paid by
            <select id={`${formId}-payer`} value={selectedPayer} onChange={(event) => setPaidBy(event.target.value)} required>
              {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}{member.userId === currentUserId ? ' (you)' : ''}</option>)}
            </select>
          </label>
        </div>
        <div className="form-actions"><button className="button primary" disabled={saving || members.length === 0} type="submit">{saving ? 'Adding expense…' : 'Add expense'}</button></div>
      </form>
    </section>
  );
}

export function categoryName(category: string) {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
