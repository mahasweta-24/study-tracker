import { useEffect, useRef, useState } from 'react';

const paths = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  board: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v11h-4z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  forward: 'M5 5l7 7-7 7M12 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  home: 'M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z',
  chart: 'M5 20V11M12 20V5M19 20v-6',
  book: 'M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4zM5 16a4 4 0 014-4h10',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-7 3.4M3 4v4h4M12 8v4l3 2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l4-4-4-4M14 12H4',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 100-10 5 5 0 000 10z',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  play: 'M8 5v14l11-7z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  flame: 'M12 21c4 0 7-3 7-7 0-3-2-5.5-3.5-7-.5 2-1.5 3-3 3.5C13 7 12 4 9.5 2.5 9.5 6 5 8.5 5 14c0 4 3 7 7 7z',
  reset: 'M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0012 2.5M18.5 9a7 7 0 00-12-2.5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M15.5 3.2a3.5 3.5 0 010 6.6',
  note: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
};

export function Icon({ name, size = 18, className = '', strokeWidth = 1.9 }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function ProgressRing({ value, total, size = 92, stroke = 9, color = 'var(--accent)', label }) {
  const pct = total ? value / total : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${value} of ${total} complete`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="ring-label">
        <strong>{Math.round(pct * 100)}%</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

export function Bar({ value, total, color }) {
  const pct = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemax={total}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Every progress-changing action goes through this dialog: it explains what will
 * change, asks for a message (stored in the activity log) and requires confirmation.
 */
export function ActionDialog({
  title, confirmLabel = 'Confirm', tone = 'primary', initial = {}, controls, preview, validate,
  messageLabel = 'Message', messagePlaceholder = 'Why are you making this change?', defaultMessage = '',
  onConfirm, onClose,
}) {
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState(defaultMessage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const invalid = validate?.(values);
  const canSubmit = !busy && message.trim().length > 0 && !invalid;

  async function submit(e) {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(message.trim(), values);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`btn ${tone}`} onClick={submit} disabled={!canSubmit}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </>
      }>
      <form onSubmit={submit} className="stack">
        {controls?.(values, (patch) => setValues((v) => ({ ...v, ...patch })))}
        {preview && <div className="preview">{preview(values)}</div>}
        {invalid && <div className="form-error">{invalid}</div>}
        <label className="field">
          <span>{messageLabel} <em className="req">required</em></span>
          <textarea ref={ref} rows={3} value={message} maxLength={1000} placeholder={messagePlaceholder}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }} />
        </label>
        <p className="hint">This message is saved with the change in your activity history. Press Ctrl/⌘ + Enter to confirm.</p>
        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}

export function Drawer({ onClose, children, label }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>
        <button className="icon-btn drawer-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        {children}
      </aside>
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 60 }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">−</button>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">+</button>
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value}
          className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />} {o.label}
        </button>
      ))}
    </div>
  );
}

export function NoteBox({ value, onSave }) {
  const [text, setText] = useState(value || '');
  const [state, setState] = useState('');
  useEffect(() => setText(value || ''), [value]);
  const dirty = text !== (value || '');
  return (
    <div className="notebox">
      <textarea rows={4} value={text} placeholder="What I learned · what confused me · one snippet worth keeping"
        onChange={(e) => { setText(e.target.value); setState(''); }} />
      <div className="row between">
        <span className="hint">{state}</span>
        <button className="btn small" disabled={!dirty} onClick={async () => {
          try { await onSave(text); setState('Saved'); } catch (e) { setState(e.message); }
        }}>Save notes</button>
      </div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
