import { Logo } from '../components/Logo.jsx';
import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/ui.jsx';

export default function Login({ onAuthed, isDark, toggleTheme }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post(mode === 'login' ? '/auth/login' : '/auth/register', form);
      onAuthed(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <button className="icon-btn auth-theme" onClick={toggleTheme} aria-label="Toggle dark mode"><Icon name={isDark ? 'sun' : 'moon'} /></button>
      <section className="auth-hero">
        <div className="brand big"><Logo size={40} /><span>Study Tracker</span></div>
        <h1>Two roadmaps. One place to stay on track.</h1>
        <ul className="auth-points">
          <li><span className="dot pbi" /> <div><strong>Power BI · 100 days</strong><p>A calendar that schedules every day from your start date, and shifts the plan when life happens.</p></div></li>
          <li><span className="dot cs" /> <div><strong>Sales &amp; Marketing · 41 cases, 13 weeks</strong><p>A weekly board. Roll unfinished cases into next week or push whole weeks ahead.</p></div></li>
          <li><span className="dot log" /> <div><strong>Every change has a reason</strong><p>Each completion or shift asks for a short message, so your history explains itself.</p></div></li>
        </ul>
      </section>
      <section className="auth-card">
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="muted">{mode === 'login' ? 'Sign in to continue your plan.' : 'The first account created becomes the admin.'}</p>
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <label className="field"><span>Name</span><input value={form.name} onChange={set('name')} autoComplete="name" required /></label>
          )}
          <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
          <label className="field"><span>Password</span>
            <input type="password" value={form.password} onChange={set('password')} minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="switch">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </section>
    </div>
  );
}
