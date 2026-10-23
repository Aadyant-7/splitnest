import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { WorkflowIllustration } from '../home/WorkflowIllustration';
import './guide.css';

const sections = [
  ['getting-started', 'Create your first group'],
  ['members', 'Bring people in'],
  ['expenses', 'Record an expense'],
  ['balances', 'Read your balances'],
  ['imports', 'Import a statement'],
  ['budgets', 'Set category budgets'],
] as const;

export function GuidePage() {
  const { hash } = useLocation();
  useEffect(() => {
    const id = hash.slice(1);
    // Router links change the route before these sections exist; scroll after their commit.
    if (sections.some(([sectionId]) => sectionId === id)) {
      document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
    }
  }, [hash]);

  return <div className="guide-page">
    <header className="guide-heading"><div><p className="guide-eyebrow">The essentials</p><h1>A quick guide to SplitNest</h1><p>From your first group to a clear picture of shared costs. Follow the steps below, or jump to the task you need.</p></div><Link className="button primary" to="/app/groups#create-group">Create a group <span aria-hidden="true">↗</span></Link></header>
    <div className="guide-layout">
      <aside className="guide-sidebar">
        <nav aria-label="In this guide"><p className="guide-nav-label">In this guide</p><ol>{sections.map(([id, title], index) => <li key={id}><a href={`#${id}`}><span aria-hidden="true">0{index + 1}</span>{title}</a></li>)}</ol></nav>
        <div className="guide-workflow"><WorkflowIllustration /></div>
        <p className="guide-local-note"><strong>Saved on your local stack</strong>Your account and records live in PostgreSQL, not just this browser. Signing out does not erase them. Keep your Docker data volume to keep your data.</p>
      </aside>

      <div className="guide-sections">
        <section className="guide-section" id="getting-started" aria-labelledby="guide-start-heading"><span className="guide-step" aria-hidden="true">01</span><div><p className="guide-section-label">Get set up</p><h2 id="guide-start-heading">Create your first group</h2><p>A group is one shared space for a household, a trip or any people who share costs. On <Link to="/app/groups">My groups</Link>, give it a name and choose <strong>Create group</strong>.</p><p>You become the group’s <strong>Admin</strong>. Open it to find Overview, Expenses, Members, Imports and Budgets.</p><Link className="text-link" to="/app/groups#create-group">Go to the group form <span aria-hidden="true">→</span></Link></div></section>

        <section className="guide-section" id="members" aria-labelledby="guide-members-heading"><span className="guide-step" aria-hidden="true">02</span><div><p className="guide-section-label">People and permissions</p><h2 id="guide-members-heading">Bring people in</h2><p>Each person first creates their own account from the registration page. An admin then opens the group’s <strong>Members</strong> section and adds their registered email.</p><div className="guide-role-grid"><div><h3>Admin</h3><p>Add or remove members, set budgets, and manage the group’s expenses.</p></div><div><h3>Member</h3><p>Add expenses, upload statements, and view the group’s balances and budgets.</p></div></div><p className="guide-note">Adding an email is a direct membership change. SplitNest does not send invitation emails. Only people in a group can open it.</p></div></section>

        <section className="guide-section" id="expenses" aria-labelledby="guide-expenses-heading"><span className="guide-step" aria-hidden="true">03</span><div><p className="guide-section-label">Everyday use</p><h2 id="guide-expenses-heading">Record an expense</h2><p>In <strong>Expenses</strong>, enter a description, a positive INR amount, a category, the date and who paid. Saving records the expense and each current member’s equal share together.</p><p>Splits are exact to the paise. If the amount does not divide evenly, the remaining paise are assigned in a fixed order so the shares always add up.</p><div className="guide-example"><span>Illustrative example · 3 members</span><p>A <strong>₹100.00</strong> expense becomes shares of <strong>₹33.33, ₹33.33 and ₹33.34</strong>.</p></div><p>You can delete an expense you created; an admin can delete any expense in that group. Removing a member keeps their past expense shares in the financial history.</p></div></section>

        <section className="guide-section" id="balances" aria-labelledby="guide-balances-heading"><span className="guide-step" aria-hidden="true">04</span><div><p className="guide-section-label">Know where you stand</p><h2 id="guide-balances-heading">Read your balances</h2><p>Open <strong>Overview</strong> to see every member’s totals. The net balance is what they paid minus their share of all recorded expenses.</p><dl className="guide-balance-key"><div><dt>Positive (+)</dt><dd>The person paid more than their share and is owed that amount.</dd></div><div><dt>Negative (−)</dt><dd>The person paid less than their share and owes that amount.</dd></div><div><dt>Zero</dt><dd>Their payments and share are equal.</dd></div></dl><p className="guide-note">These are expense records. SplitNest does not transfer money or process payments.</p></div></section>

        <section className="guide-section" id="imports" aria-labelledby="guide-imports-heading"><span className="guide-step" aria-hidden="true">05</span><div><p className="guide-section-label">Add several at once</p><h2 id="guide-imports-heading">Import a statement</h2><p>In <strong>Imports</strong>, upload a CSV or XLSX file up to <strong>5 MiB</strong>. Prepare these three column headings in the first row:</p><div className="guide-file-format"><code>date,description,amount</code><span>Dates: YYYY-MM-DD · Amounts: positive INR values</span></div><p>Processing runs in the background. Valid rows become expenses paid by you and split among the group’s members when saved. Descriptions are categorized using keyword rules; invalid rows are skipped.</p><p>Check the result for saved and invalid row counts. This browser tab remembers its latest upload for your account and group. A failed file needs correcting before you upload again.</p><a className="button secondary" href="/examples/statement.csv" download="splitnest-statement-example.csv">Download sample CSV <span aria-hidden="true">↓</span></a></div></section>

        <section className="guide-section" id="budgets" aria-labelledby="guide-budgets-heading"><span className="guide-step" aria-hidden="true">06</span><div><p className="guide-section-label">Keep limits in view</p><h2 id="guide-budgets-heading">Set category budgets</h2><p>An admin can set a monthly INR limit for any category in <strong>Budgets</strong>. Members can view those limits and the group’s recorded alerts.</p><p>The daily check runs at <strong>00:00 UTC</strong> while the app is running. When the current UTC month’s category spending exceeds its limit, it records one alert for that category and month.</p><p className="guide-note">Alerts are snapshots from that scheduled check. Saving a budget does not trigger an immediate check, and the alert amount is not a live spending total.</p></div></section>
        <div className="guide-end"><div><h2>Ready to try it?</h2><p>Start with a group, add your people, then record one shared expense.</p></div><Link className="button primary" to="/app/groups">Open my groups <span aria-hidden="true">→</span></Link></div>
      </div>
    </div>
  </div>;
}
