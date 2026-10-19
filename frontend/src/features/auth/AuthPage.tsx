import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useSession } from '../../app/SessionContext';
import { ErrorNotice, Loading } from '../../shared/ui/Feedback';

export function Brand() {
  return <span className="brand"><svg aria-hidden="true" viewBox="0 0 40 40"><rect width="40" height="40" rx="13" fill="currentColor" /><path d="M11 14h18M11 20h11M11 26h18" stroke="#e0efc5" strokeWidth="3" strokeLinecap="round" /><circle cx="28" cy="20" r="2.5" fill="#e0efc5" /></svg>SplitNest<span className="brand-dot">.</span></span>;
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const session = useSession();
  const [search] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const isRegister = mode === 'register';
  const requested = search.get('next') ?? '/app/groups';
  const next = /^\/app(?:\/|$)/.test(requested) ? requested : '/app/groups';
  if (session.loading) return <div className="initial-loading"><Loading label="Opening your nest…" /></div>;
  if (session.user) return <Navigate to={next} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError(null);
    try {
      const email = String(form.get('email') ?? '').trim();
      const password = String(form.get('password') ?? '');
      if (isRegister) await session.register(String(form.get('displayName') ?? '').trim(), email, password);
      else await session.login(email, password);
    } catch (failure) { setError(failure); }
    finally { setPending(false); }
  }

  return <div className="auth-layout">
    <section className="auth-story" aria-label="About SplitNest">
      <Link to="/login" className="brand-link"><Brand /></Link>
      <div className="story-copy"><p className="eyebrow">SHARED PLANS. LESS MATH.</p>
        <h1>Good company.<br /><em>Clear balances.</em></h1>
        <p>A home for your shared expenses. Keep the little things fair, so you can focus on the good stuff.</p>
      </div>
      <div className="split-illustration" aria-label="Example: a shared expense of 100 rupees splits exactly into 33.34, 33.33 and 33.33">
        <div className="illustration-label"><span className="illustration-icon">↗</span> A little clarity goes a long way</div>
        <div className="illustration-amount">₹100<span>.00</span><span className="illustration-tag">Split equally</span></div>
        <div className="illustration-rule" />
        <div className="illustration-people"><div><span className="person person-one">A</span><strong>₹33.34</strong></div><div><span className="person person-two">B</span><strong>₹33.33</strong></div><div><span className="person person-three">C</span><strong>₹33.33</strong></div></div>
        <p>Every paise accounted for.</p>
      </div>
      <p className="story-footer">Flatmates. Friends. Your next adventure.</p>
    </section>
    <main className="auth-main" id="main-content">
      <div className="auth-form-wrap">
        <p className="eyebrow">YOUR SPACE, TOGETHER</p>
        <h2>{isRegister ? 'Make yourself at home.' : 'Welcome back.'}</h2>
        <p className="auth-subtitle">{isRegister ? 'Create your account and start sharing fairly.' : 'Sign in to pick up where your group left off.'}</p>
        <ErrorNotice error={error ?? session.error} />
        <form onSubmit={submit} className="stack" aria-label={isRegister ? 'Create account' : 'Sign in'}>
          {isRegister && <label className="field">Your name<input name="displayName" autoComplete="name" maxLength={100} required placeholder="What should we call you?" /></label>}
          <label className="field">Email address<input name="email" type="email" autoComplete="email" required maxLength={320} placeholder="you@example.com" /></label>
          <label className="field">Password<span className="password-input"><input name="password" type={visible ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} required placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} /><button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button></span></label>
          {isRegister && <p className="field-hint">Use at least 8 characters. For this local demo, use a password you don’t use elsewhere.</p>}
          <button className="button primary auth-submit" disabled={pending} type="submit">{pending ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}<span aria-hidden="true">↗</span></button>
        </form>
        <p className="auth-switch">{isRegister ? 'Already part of a nest?' : 'New around here?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
        <div className="auth-bottom"><span aria-hidden="true">✳</span><p>Real expenses. Fair shares.<br />A little less to keep in your head.</p></div>
      </div>
    </main>
  </div>;
}
