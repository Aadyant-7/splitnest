import { Link } from 'react-router';
import { Brand } from '../../shared/ui/Brand';
import './landing.css';

const steps = [
  { number: '01', title: 'Bring your group together', text: 'Create a household or trip group, then add people using their registered email addresses.' },
  { number: '02', title: 'Record a shared expense', text: 'Choose who paid. SplitNest saves an equal share for every current member, down to the last paisa.' },
  { number: '03', title: 'See where everyone stands', text: 'Open the group overview to compare what each person paid, their share and their net balance.' },
];

function ExampleLedger() {
  return <div className="landing-example" aria-labelledby="example-title">
    <div className="landing-example-top"><span className="landing-example-label">An example group</span><span className="landing-example-dots" aria-hidden="true">•••</span></div>
    <div className="landing-example-heading"><span className="landing-house" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none"><path d="M8 23 24 9l16 14M13 20v19h22V20M21 39V27h7v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span><div><h2 id="example-title">Weekend away</h2><p>3 people · INR</p></div></div>
    <div className="landing-example-expense"><span className="landing-meal" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none"><path d="M8 5v9m4-9v9M8 10h4m-2 4v13M23 5v22m0-22c-6 3-6 12 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </span><div><strong>Dinner together</strong><span>Avery paid</span></div><strong className="landing-example-amount">₹900.00</strong></div>
    <div className="landing-example-split"><span>Equal share</span><strong>₹300.00 each</strong></div>
    <div className="landing-example-balances" aria-label="Illustrative balances">
      <div><span className="landing-person landing-person-a" aria-hidden="true">A</span><span>Avery<small>Paid ₹900 · Share ₹300</small></span><strong>+₹600.00<small>is owed</small></strong></div>
      <div><span className="landing-person landing-person-b" aria-hidden="true">B</span><span>Blair<small>Paid ₹0 · Share ₹300</small></span><strong className="landing-owes">−₹300.00<small>owes</small></strong></div>
      <div><span className="landing-person landing-person-c" aria-hidden="true">C</span><span>Casey<small>Paid ₹0 · Share ₹300</small></span><strong className="landing-owes">−₹300.00<small>owes</small></strong></div>
    </div>
    <p className="landing-example-caption">Illustration only. Your account starts with your own records.</p>
  </div>;
}

export function LandingPage() {
  return <div className="landing-page">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="landing-header"><Link to="/" className="brand-link" aria-label="SplitNest home"><Brand /></Link>
      <nav aria-label="Main navigation"><a className="landing-how-link" href="#how-it-works">How it works</a><Link to="/login">Sign in</Link><Link className="button primary" to="/register">Get started</Link></nav>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy"><p className="landing-eyebrow"><span aria-hidden="true" />For households, friends and trips</p>
          <h1 id="landing-title">One place for your group’s <span>shared expenses.</span></h1>
          <p className="landing-intro">Keep track of who paid, split costs equally and understand what each person owes. Start with a group and your first expense.</p>
          <div className="landing-actions"><Link className="button primary" to="/register">Create your account <span aria-hidden="true">↗</span></Link><a className="button secondary" href="#how-it-works">See how it works</a></div>
          <ul className="landing-facts" aria-label="Application details"><li>Exact INR splits</li><li>CSV &amp; XLSX imports</li><li>Category budgets</li></ul>
        </div>
        <div className="landing-hero-visual"><div className="landing-grid-pattern" aria-hidden="true" /><ExampleLedger /><div className="landing-visual-note"><span aria-hidden="true">✓</span> One expense. Everyone’s share accounted for.</div></div>
      </section>
      <section className="landing-process" id="how-it-works" aria-labelledby="process-title">
        <div className="landing-section-heading"><div><p className="landing-eyebrow">From the first expense onward</p><h2 id="process-title">A simple way to keep the group in sync</h2></div><p>No bank connection or payments. Just a clear record of shared costs.</p></div>
        <ol className="landing-steps">{steps.map((step) => <li key={step.number}><span className="landing-step-number" aria-hidden="true">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
      </section>
      <section className="landing-tools" aria-labelledby="tools-title"><div><p className="landing-eyebrow">When your group has more to record</p><h2 id="tools-title">More than adding one expense at a time.</h2><p>Import a prepared statement, organize expenses by category and set monthly limits—all inside the same group.</p><Link to="/register" className="landing-text-link">Start your first group <span aria-hidden="true">→</span></Link></div>
        <div className="landing-tool-list"><article><span aria-hidden="true">01 / Import</span><h3>Bring in a statement</h3><p>Upload CSV or XLSX rows. Check the actual imported and invalid counts when background processing finishes.</p></article><article><span aria-hidden="true">02 / Budget</span><h3>Keep category limits visible</h3><p>Admins save monthly limits. Daily checks create an alert when recorded spending goes over a limit.</p></article></div>
      </section>
    </main>
    <footer className="landing-footer"><span>SplitNest · Shared expense records</span><span>Local application · Amounts in INR</span><Link to="/login">Sign in to your workspace</Link></footer>
  </div>;
}
