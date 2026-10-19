import { useState } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthPage, Brand } from '../features/auth/AuthPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { GroupPage } from '../features/groups/GroupPage';
import { ErrorNotice, Loading } from '../shared/ui/Feedback';
import { useSession } from './SessionContext';

function Shell() {
  const { user, loading, logout } = useSession();
  const location = useLocation();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  if (loading) return <div className="initial-loading"><Loading label="Opening your nest…" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  async function signOut() {
    setPending(true); setError(null);
    try { await logout(); } catch (failure) { setError(failure); }
    finally { setPending(false); }
  }
  return <div className="app-layout" key={user.id}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <Link className="brand-link" to="/app/groups"><Brand /></Link>
      <p className="sidebar-label">YOUR SPACE</p>
      <nav aria-label="Main navigation"><Link className="nav-item active" to="/app/groups"><span aria-hidden="true">▦</span> My groups<span className="nav-arrow" aria-hidden="true">↗</span></Link></nav>
      <div className="sidebar-note"><span aria-hidden="true">✳</span><h3>Better, together.</h3><p>A shared plan deserves a clear picture.</p></div>
      <div className="sidebar-bottom"><span className="status-dot" /> A little clarity, every day.</div>
    </aside>
    <div className="app-body">
      <header className="topbar"><span className="topbar-caption">A HOME FOR SHARED EXPENSES</span><div className="profile"><span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><span className="profile-name">{user.displayName}</span><button className="signout" disabled={pending} onClick={() => void signOut()}>{pending ? 'Signing out…' : 'Sign out'}</button></div></header>
      <main id="main-content" className="main-content" tabIndex={-1}><ErrorNotice error={error} /><Outlet key={user.id} /></main>
      <footer className="app-footer">Made for shared moments. <span>All amounts in INR.</span></footer>
    </div>
  </div>;
}
function Home() {
  const { user, loading } = useSession();
  if (loading) return <Loading />;
  return <Navigate to={user ? '/app/groups' : '/login'} replace />;
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
    <Route path="*" element={<main className="not-found"><p className="eyebrow">404 · A WRONG TURN</p><h1>This nest isn’t here.</h1><p>The page may have moved, or the address may be incomplete.</p><Link className="button primary" to="/app/groups">Back to my groups</Link></main>} />
  </Routes></BrowserRouter>;
}
