import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { AppCtx } from './store.js';
import { Icon } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PowerBI from './pages/PowerBI.jsx';
import Cases from './pages/Cases.jsx';
import Activity from './pages/Activity.jsx';
import Admin from './pages/Admin.jsx';

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
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const isDark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return [isDark, () => setTheme(isDark ? 'light' : 'dark')];
}

const NAV = [
  { id: 'home', label: 'Dashboard', icon: 'home' },
  { id: 'powerbi', label: 'Power BI', icon: 'chart' },
  { id: 'cases', label: 'Case studies', icon: 'book' },
  { id: 'activity', label: 'My activity', icon: 'history' },
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

  useEffect(() => {
    if (!user) { setPbi(null); setCases(null); return; }
    api.get('/powerbi').then(setPbi);
    api.get('/cases').then(setCases);
  }, [user]);

  const notify = useCallback((text, tone = 'ok') => {
    setToast({ text, tone, id: Date.now() });
  }, []);
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

  const nav = user.role === 'admin' ? [...NAV, { id: 'admin', label: 'Admin', icon: 'shield' }] : NAV;
  const ready = pbi && cases;
  let page;
  if (!ready) page = <div className="splash small"><div className="spinner" /></div>;
  else if (route === 'powerbi') page = <PowerBI />;
  else if (route === 'cases') page = <Cases />;
  else if (route === 'activity') page = <Activity />;
  else if (route === 'admin' && user.role === 'admin') page = <Admin />;
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
          <a className="brand" href="#/">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>Study Tracker</span>
          </a>
          <nav className="nav">
            {nav.map((n) => (
              <a key={n.id} href={`#/${n.id === 'home' ? '' : n.id}`} className={route === n.id || (n.id === 'home' && !nav.some((x) => x.id === route)) ? 'active' : ''}>
                <Icon name={n.icon} size={17} /> <span>{n.label}</span>
              </a>
            ))}
          </nav>
          <div className="topbar-right">
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle theme">
              <Icon name={isDark ? 'sun' : 'moon'} />
            </button>
            <div className="avatar" title={`${user.name} (${user.email})`}>{user.name.slice(0, 1).toUpperCase()}</div>
            <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
          </div>
        </header>
        <main className="main">{page}</main>
      </div>
      {dialog}
      {toast && <div key={toast.id} className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </AppCtx.Provider>
  );
}
