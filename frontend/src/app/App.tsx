import { useState } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthPage } from '../features/auth/AuthPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { GroupPage } from '../features/groups/GroupPage';
import { Brand } from '../shared/ui/Brand';
import { ErrorNotice, Loading } from '../shared/ui/Feedback';
import { useSession } from './SessionContext';

function Shell() {
  const { user, loading, logout } = useSession();
  const location = useLocation();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  if (loading) return <div className="initial-loading"><Loading label="Restoring your session…" /></div>;
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent(location.pathname)} replace />;

  async function signOut() {
    setPending(true);
    setError(null);
    try { await logout(); } catch (failure) { setError(failure); }
    finally { setPending(false); }
  }

  return <div className="app-layout" key={user.id}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand-link" to="/app/groups" aria-label="SplitNest home"><Brand /></Link>
        <nav aria-label="Main navigation"><NavLink className="header-nav" to="/app/groups">My groups</NavLink></nav>
        <div className="profile">
          <span className="avatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="profile-name" title={user.displayName}>{user.displayName}</span>
          <button className="button secondary signout" disabled={pending} onClick={() => void signOut()}>
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
    <main id="main-content" className="main-content" tabIndex={-1}>
      <ErrorNotice error={error} /><Outlet key={user.id} />
    </main>
  </div>;
}

function Home() {
  const { user, loading } = useSession();
  if (loading) return <Loading />;
  return <Navigate to={user ? '/app/groups' : '/login'} replace />;
}

function NotFound() {
  return <main className="not-found"><Brand /><h1>Page not found</h1>
    <p className="muted">Check the address or return to your groups.</p>
    <Link className="button primary" to="/app/groups">Back to my groups</Link>
  </main>;
}

export function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage key="register" mode="register" />} />
    <Route path="/app" element={<Shell />}>
      <Route index element={<Navigate to="groups" replace />} />
      <Route path="groups" element={<GroupsPage />} />
      <Route path="groups/:groupId" element={<GroupPage />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter>;
}
