import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useSession } from '../../app/SessionContext';
import { ApiError } from '../../shared/api/client';
import { Brand } from '../../shared/ui/Brand';
import { ErrorNotice, Loading } from '../../shared/ui/Feedback';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const session = useSession();
  const [search] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const isRegister = mode === 'register';
  const requested = search.get('next') ?? '/app/home';
  const next = /^\/app(?:\/|$)/.test(requested) ? requested : '/app/home';
  const fields = error instanceof ApiError ? error.errors : {};
  if (session.loading) return <div className="initial-loading"><Loading label="Restoring your session…" /></div>;
  if (session.user) return <Navigate to={next} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const email = String(form.get('email') ?? '').trim();
      const password = String(form.get('password') ?? '');
      if (isRegister) await session.register(String(form.get('displayName') ?? '').trim(), email, password);
      else await session.login(email, password);
    } catch (failure) { setError(failure); }
    finally { setPending(false); }
  }

  return <div className="auth-layout">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <main className="auth-main" id="main-content" tabIndex={-1}>
      <Link to="/" className="brand-link" aria-label="SplitNest home"><Brand /></Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-heading">
          <h1 id="auth-title">{isRegister ? 'Create account' : 'Sign in'}</h1>
          <p className="muted">{isRegister ? 'Enter your details to start a shared expense group.' : 'Enter your details to open your groups.'}</p>
        </header>
        <ErrorNotice error={error ?? session.error} />
        <form onSubmit={submit} className="stack" aria-label={isRegister ? 'Create account' : 'Sign in'} aria-busy={pending}>
          {isRegister && <div className="field"><label htmlFor="auth-name">Your name</label>
            <input id="auth-name" name="displayName" autoComplete="name" maxLength={100} required autoFocus
              aria-invalid={Boolean(fields.displayName)} aria-describedby={fields.displayName ? 'name-error' : undefined} />
            {fields.displayName && <span className="field-error" id="name-error">{fields.displayName}</span>}
          </div>}
          <div className="field"><label htmlFor="auth-email">Email address</label>
            <input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={320}
              aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? 'email-error' : undefined} />
            {fields.email && <span className="field-error" id="email-error">{fields.email}</span>}
          </div>
          <div className="field"><label htmlFor="auth-password">Password</label>
            <span className="password-input">
              <input id="auth-password" name="password" type={visible ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 8 : undefined} required aria-invalid={Boolean(fields.password)}
                aria-describedby={fields.password ? 'password-error' : isRegister ? 'password-hint' : undefined} />
              <button type="button" className="password-toggle" onClick={() => setVisible(!visible)}
                aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button>
            </span>
            {fields.password ? <span className="field-error" id="password-error">{fields.password}</span>
              : isRegister && <span className="field-hint" id="password-hint">Use at least 8 characters.</span>}
          </div>
          <button className="button primary auth-submit" type="submit" disabled={pending}>
            {pending ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create account' : 'Sign in')}
          </button>
        </form>
        <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to SplitNest?'}{' '}
            <Link to={(isRegister ? '/login' : '/register') + (search.has('next') ? '?next=' + encodeURIComponent(next) : '')}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
        </p>
      </section>
      <p className="auth-caption"><Link to="/">How SplitNest works</Link></p>
    </main>
  </div>;
}
