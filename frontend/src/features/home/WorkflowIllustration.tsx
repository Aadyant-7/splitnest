import './workflow.css';

function WorkflowIcon({ kind }: { kind: 'people' | 'receipt' | 'shares' }) {
  if (kind === 'people') return <svg viewBox="0 0 104 76" fill="none" aria-hidden="true">
    <rect x="9" y="8" width="86" height="62" rx="10" fill="#fff" stroke="#c5d7dc" />
    <circle cx="52" cy="28" r="10" fill="#a6d6c8" />
    <circle cx="28" cy="34" r="7" fill="#d5e4ed" /><circle cx="76" cy="34" r="7" fill="#e9cf9d" />
    <path d="M35 58c0-13 34-13 34 0" fill="#a6d6c8" /><path d="M16 56c0-10 22-10 22 0M66 56c0-10 22-10 22 0" stroke="#a8bdc8" strokeWidth="5" strokeLinecap="round" />
  </svg>;
  if (kind === 'receipt') return <svg viewBox="0 0 104 76" fill="none" aria-hidden="true">
    <path d="M27 7h50v61l-6-4-6 4-6-4-7 4-7-4-6 4-6-4-6 4V7Z" fill="#fff" stroke="#c5d7dc" strokeLinejoin="round" />
    <rect x="37" y="18" width="30" height="6" rx="3" fill="#96cdbc" />
    <path d="M37 34h30M37 43h21M37 53h30" stroke="#bbcdd5" strokeWidth="3" strokeLinecap="round" />
  </svg>;
  return <svg viewBox="0 0 104 76" fill="none" aria-hidden="true">
    <rect x="9" y="8" width="86" height="62" rx="10" fill="#fff" stroke="#c5d7dc" />
    {[25, 40, 55].map((y, index) => <g key={y}><circle cx="25" cy={y} r="4" fill={['#96cdbc', '#c5d9e4', '#e9cf9d'][index]} /><path d={`M37 ${y}h20M68 ${y}h12`} stroke="#bbcdd5" strokeWidth="3" strokeLinecap="round" /></g>)}
  </svg>;
}

/** A schematic teaches the flow without pretending to show this account's financial data. */
export function WorkflowIllustration() {
  return <figure className="workflow-figure" aria-label="Illustration: from a group to an expense and equal shares">
    <p className="workflow-label"><span aria-hidden="true" />How it works · Illustration</p>
    <ol className="workflow-steps">
      <li><WorkflowIcon kind="people" /><strong>Group</strong><span>Add your people</span></li>
      <li><WorkflowIcon kind="receipt" /><strong>Expense</strong><span>Record a cost</span></li>
      <li><WorkflowIcon kind="shares" /><strong>Shares</strong><span>Split it equally</span></li>
    </ol>
    <figcaption>One shared expense. A clear share for every member.</figcaption>
  </figure>;
}
