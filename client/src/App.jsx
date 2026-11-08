import { Logo } from './components/Logo.jsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { AppCtx } from './store.js';
import { EMBEDDED } from './env.js';
import { Icon } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PowerBI from './pages/PowerBI.jsx';
import Cases from './pages/Cases.jsx';
import Activity from './pages/Activity.jsx';
import Admin from './pages/Admin.jsx';
import Account, { MustChangePassword } from './pages/Account.jsx';

function useHashRoute() {
  const get = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'home');
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => { setRoute(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (EMBEDDED) return; // the claude.ai viewer owns the theme
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const isDark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return [isDark, () => setTheme(isDark ? 'light' : 'dark')];
}

const NAV = [
  { id: 'home', label: 'Dashboard', short: 'Home', icon: 'home' },
  { id: 'powerbi', label: 'Power BI', short: 'Power BI', icon: 'chart' },
  { id: 'cases', label: 'Case studies', short: 'Cases', icon: 'book' },
  { id: 'activity', label: 'My activity', short: 'Activity', icon: 'history' },
];

export default function App() {
  const route = useHashRoute();
  const [isDark, toggleTheme] = useTheme();
  const [user, setUser] = useState(undefined);
  const [content, setContent] = useState(null);
  const [pbi, setPbi] = useState(null);
  const [cases, setCases] = useState(null);
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    api.get('/auth/me').then((r) => setUser(r.user ?? null)).catch(() => setUser(null));
    Promise.all([api.get('/content/powerbi'), api.get('/content/cases')]).then(([p, c]) => setContent({ powerbi: p, cases: c }));
  }, []);

  const notify = useCallback((text, tone = 'ok') => {
    setToast({ text, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!user || user.mustChangePassword) { setPbi(null); setCases(null); return; }
    api.get('/powerbi').then(setPbi).catch((e) => notify(e.message, 'error'));
    api.get('/cases').then(setCases).catch((e) => notify(e.message, 'error'));
  }, [user, notify]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const openDialog = useCallback((node) => setDialog(node), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const ctx = useMemo(
    () => ({ user, content, pbi, setPbi, cases, setCases, notify, openDialog, closeDialog }),
    [user, content, pbi, cases, notify, openDialog, closeDialog]
  );

  if (user === undefined || !content) return <div className="splash"><div className="spinner" /></div>;
  if (!user) return <Login onAuthed={setUser} isDark={isDark} toggleTheme={toggleTheme} />;
  if (user.mustChangePassword) {
    return <MustChangePassword user={user} onDone={setUser} onSignOut={() => api.post('/auth/logout').then(() => setUser(null))} />;
  }

  const nav = user.role === 'admin' ? [...NAV, { id: 'admin', label: 'Admin', short: 'Admin', icon: 'shield' }] : NAV;
  const isActive = (id) => route === id || (id === 'home' && !nav.some((x) => x.id === route));
  const ready = pbi && cases;
  let page;
  if (!ready) page = <div className="splash small"><div className="spinner" /></div>;
  else if (route === 'powerbi') page = <PowerBI />;
  else if (route === 'cases') page = <Cases />;
  else if (route === 'activity') page = <Activity />;
  else if (route === 'admin' && user.role === 'admin') page = <Admin />;
  else if (route === 'account' && !EMBEDDED) page = <Account onUserChange={setUser} />;
  else page = <Dashboard />;

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
    window.location.hash = '';
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <header className="topbar">
          <a className="brand" href="#home">
            <Logo />
            <span>Study Tracker</span>
          </a>
          <nav className="nav">
            {nav.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={isActive(n.id) ? 'active' : ''}>
                <Icon name={n.icon} size={17} /> <span>{n.label}</span>
              </a>
            ))}
          </nav>
          <div className="topbar-right">
            {!EMBEDDED && (
              <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle theme">
                <Icon name={isDark ? 'sun' : 'moon'} />
              </button>
            )}
            {EMBEDDED ? (
              <div className="avatar" title={user.name}>{(user.name || '?').slice(0, 1).toUpperCase()}</div>
            ) : (
              <a className={`avatar ${route === 'account' ? 'active' : ''}`} href="#account" title={`Account: ${user.name} (${user.email})`} aria-label="Your account">
                {(user.name || '?').slice(0, 1).toUpperCase()}
              </a>
            )}
            {!EMBEDDED && <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>}
          </div>
        </header>
        <main className="main">{page}</main>
        {/* phone navigation: a labelled tab bar at the bottom of the screen */}
        <nav className="tabbar" aria-label="Sections">
          {nav.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={isActive(n.id) ? 'active' : ''} aria-current={isActive(n.id) ? 'page' : undefined}>
              <Icon name={n.icon} size={21} />
              <span>{n.short}</span>
            </a>
          ))}
        </nav>
      </div>
      {dialog}
      {toast && <div key={toast.id} className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </AppCtx.Provider>
  );
}
