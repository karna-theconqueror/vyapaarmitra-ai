export function inr(value, { decimals = 0 } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return (
    '₹' +
    Number(value).toLocaleString('en-IN', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0,
    })
  )
}

export function pct(value) {
  if (value === null || value === undefined) return 'n/a'
  return `${value}%`
}

export function dateLabel(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d - today) / 86400000)
  const formatted = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  if (diffDays === 0) return `Today · ${formatted}`
  if (diffDays === -1) return `Yesterday · ${formatted}`
  if (diffDays === 1) return `Tomorrow · ${formatted}`
  if (diffDays < 0) return `${formatted} · ${Math.abs(diffDays)}d overdue`
  return formatted
}

export function todayISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export const MARGIN_STATUS = {
  healthy: { label: 'Healthy', className: 'badge-ok' },
  weak: { label: 'Weak margin', className: 'badge-warn' },
  negative: { label: 'Negative margin', className: 'badge-crit' },
  unknown: { label: 'Missing data', className: 'badge-mute' },
}
