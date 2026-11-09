import { NavLink, useLocation } from 'react-router-dom'
import { Logo } from './ui.jsx'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '▤', hint: 'Daily brief' },
  { to: '/profit', label: 'ProfitGuard', icon: '₹', hint: 'Margins' },
  { to: '/stock', label: 'StockSense', icon: '▦', hint: 'Low stock' },
  { to: '/customers', label: 'Customer Comeback', icon: '☺', hint: 'Follow-ups' },
  { to: '/voice', label: 'VoiceDukaan', icon: '◉', hint: 'Voice input' },
  { to: '/settings', label: 'Settings', icon: '⚙', hint: 'Data & privacy' },
]

/**
 * App chrome: sticky header + sidebar navigation (stacks on small screens).
 * Dashboard priorities: responsive, readable, always shows the active area.
 */
export default function Shell({ merchant, children }) {
  const location = useLocation()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'rgb(255 255 255 / 0.92)',
          backdropFilter: 'blur(6px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '0.6rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Logo />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontWeight: 750, letterSpacing: '-0.02em' }}>VyapaarMitra AI</div>
            <div className="hint">
              {merchant?.shop_name || 'Your shop'} · demo data
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-mute">Estimates only</span>
            <NavLink to="/settings" className="btn btn-ghost" style={{ padding: '0.35rem 0.7rem' }}>
              {merchant?.owner_name || 'Profile'}
            </NavLink>
          </div>
        </div>

        <nav
          aria-label="Modules"
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '0 0.6rem 0.5rem',
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
          }}
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="btn"
              style={{
                padding: '0.4rem 0.75rem',
                whiteSpace: 'nowrap',
                fontWeight: 600,
                fontSize: '0.85rem',
                background:
                  location.pathname.startsWith(item.to) ? 'var(--brand-soft)' : 'transparent',
                color:
                  location.pathname.startsWith(item.to) ? 'var(--brand-dark)' : 'var(--muted)',
              }}
            >
              <span aria-hidden="true" style={{ opacity: 0.75 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main
        style={{
          width: '100%',
          maxWidth: 1180,
          margin: '0 auto',
          padding: '1.1rem 1rem 2.5rem',
          flex: 1,
        }}
      >
        {children}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--line)',
          background: 'rgb(255 255 255 / 0.6)',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '0.8rem 1rem',
            fontSize: '0.78rem',
            color: 'var(--muted)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'space-between',
          }}
        >
          <span>
            VyapaarMitra AI — decision support, not an accountant. Sample data for judging.
          </span>
          <span>Every calculation is an estimate from data you entered.</span>
        </div>
      </footer>
    </div>
  )
}
