import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { Icon } from '../components/ui.jsx';
import { fmtDateTime } from '../dates.js';

export function PasswordForm({ onDone, mustChange = false }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(''); };
  const mismatch = form.confirm && form.next !== form.confirm;

  async function submit(e) {
    e.preventDefault();
    if (form.next.length < 8) return setError('The new password must be at least 8 characters.');
    if (form.next !== form.confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      const r = await api.post('/auth/change-password', { currentPassword: form.current, newPassword: form.next });
      setForm({ current: '', next: '', confirm: '' });
      onDone(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>{mustChange ? 'Temporary password' : 'Current password'}</span>
        <input id="pw-current" type={type} value={form.current} onChange={set('current')} autoComplete="current-password" required />
      </label>
      <label className="field">
        <span>New password</span>
        <input id="pw-new" type={type} value={form.next} onChange={set('next')} autoComplete="new-password" minLength={8} required />
        <span className="hint">At least 8 characters.</span>
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input id="pw-confirm" type={type} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
        {mismatch && <span className="hint text-warn">The passwords don't match yet.</span>}
      </label>
      <label className="toggle small"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
      {error && <div className="form-error">{error}</div>}
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : mustChange ? 'Set new password' : 'Change password'}</button>
    </form>
  );
}

// Shown right after signing in with a temporary password from an admin reset.
export function MustChangePassword({ user, onDone, onSignOut }) {
  return (
    <div className="auth single">
      <section className="auth-card">
        <h2>Set a new password</h2>
        <p className="muted">An admin reset your password. Enter the temporary password you were given, then choose a new one to continue, {user.name.split(' ')[0]}.</p>
        <PasswordForm mustChange onDone={onDone} />
        <p className="switch"><button className="link" onClick={onSignOut}>Sign out</button></p>
      </section>
    </div>
  );
}

export default function Account({ onUserChange }) {
  const { user, notify } = useApp();
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Your account</h1>
        </div>
      </div>
      <section className="card">
        <dl className="summary">
          <div><dt>Name</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Role</dt><dd>{user.role === 'admin' ? 'Admin' : 'Member'}</dd></div>
          {user.createdAt && <div><dt>Joined</dt><dd>{fmtDateTime(user.createdAt)}</dd></div>}
        </dl>
      </section>
      <section className="card stack">
        <div>
          <h3><Icon name="shield" size={17} /> Change password</h3>
          <p className="muted small">You stay signed in here. Any other devices signed in to your account will be signed out.</p>
        </div>
        <PasswordForm onDone={(u) => { onUserChange(u); notify('Password changed'); }} />
      </section>
    </div>
  );
}
