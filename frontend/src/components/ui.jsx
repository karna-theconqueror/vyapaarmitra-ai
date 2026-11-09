export function Logo({ size = 30 }) {
  return (
    <span
      className="logo-mark"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
      }}
      aria-hidden="true"
    >
      VM
    </span>
  )
}

export function Notice({ kind = 'info', children }) {
  if (!children) return null
  return <div className={`notice notice-${kind}`}>{children}</div>
}

export function Empty({ icon = '✓', title, children }) {
  return (
    <div className="empty">
      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      {children ? <div style={{ marginTop: 4 }}>{children}</div> : null}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="empty" role="status">
      <span
        className="spinner"
        style={{
          width: 14,
          height: 14,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: 'var(--brand)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          verticalAlign: '-2px',
        }}
      />
      {label}
    </div>
  )
}

export function Stat({ label, value, sub, tone = 'plain' }) {
  const toneColor =
    tone === 'good' ? 'var(--brand)' : tone === 'warn' ? '#b45309' : tone === 'bad' ? 'var(--danger)' : 'var(--ink)'
  return (
    <div className="card card-tight">
      <div className="panel-title">{label}</div>
      <div className="stat-value" style={{ color: toneColor, marginTop: 4 }}>
        {value}
      </div>
      {sub ? <div className="hint" style={{ marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint" style={{ display: 'block', marginTop: 3 }}>{hint}</span> : null}
    </label>
  )
}

export function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h3 style={{ fontSize: '1.02rem' }}>{title}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close" style={{ padding: '0.25rem 0.55rem' }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SeverityDot({ severity }) {
  const color =
    severity === 'critical'
      ? 'var(--danger)'
      : severity === 'warning'
        ? 'var(--accent)'
        : 'var(--info)'
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        display: 'inline-block',
        flex: 'none',
        marginTop: 6,
      }}
    />
  )
}
