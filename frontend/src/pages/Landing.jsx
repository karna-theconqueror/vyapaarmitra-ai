import { Link } from 'react-router-dom'
import { Logo } from '../components/ui.jsx'

const MODULES = [
  {
    name: 'ProfitGuard',
    tag: 'Profit clarity',
    color: '#0e7a5f',
    body: 'Compare entered cost and selling price to see estimated gross profit and margin — labelled as estimates, never as audited profit.',
    output: '“Estimated gross margin is 18%.”',
  },
  {
    name: 'StockSense',
    tag: 'Stock awareness',
    color: '#f59e0b',
    body: 'Track quantity against your own alert level. Get a suggested reorder amount only when you have set a target.',
    output: '“Tea is below your 5-unit alert level.”',
  },
  {
    name: 'Customer Comeback',
    tag: 'Repeat follow-up',
    color: '#2563eb',
    body: 'Keep minimal customer notes with a follow-up date. See what is due today, edit the message, then send it yourself.',
    output: '“Three customer follow-ups are due.”',
  },
  {
    name: 'VoiceDukaan',
    tag: 'Voice interaction',
    color: '#7c3aed',
    body: 'Speak a short command, check the transcript, correct it if needed, and confirm before anything is saved.',
    output: '“Add 4 packets of tea?”',
  },
]

const STEPS = [
  ['Profile', 'Set up your shop'],
  ['Enter data', 'Products, costs, sales'],
  ['Review', 'Alerts & daily brief'],
  ['Act', 'Update stock, follow up'],
  ['Track', 'Record the outcome'],
]

export default function Landing({ merchant }) {
  const primaryTo = merchant ? '/dashboard' : '/onboarding'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid var(--line)',
          background: 'rgb(255 255 255 / 0.7)',
        }}
      >
        <div
          style={{
            maxWidth: 1080,
            margin: '0 auto',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Logo />
          <strong style={{ letterSpacing: '-0.02em' }}>VyapaarMitra AI</strong>
          <span className="badge badge-mute" style={{ marginLeft: 4 }}>
            Hackathon prototype
          </span>
          <Link to={primaryTo} className="btn btn-primary" style={{ marginLeft: 'auto' }}>
            {merchant ? 'Open dashboard' : 'Get started'}
          </Link>
        </div>
      </header>

      <main
        style={{
          width: '100%',
          maxWidth: 1080,
          margin: '0 auto',
          padding: '2.4rem 1rem 3rem',
          flex: 1,
        }}
      >
        {/* Hero */}
        <section style={{ maxWidth: 760 }}>
          <span className="badge badge-ok">Your AI-powered business growth partner</span>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', marginTop: 14 }}>
            Turn everyday shop data into clearer daily decisions.
          </h1>
          <p className="muted" style={{ fontSize: '1.06rem', marginTop: 14, maxWidth: 640 }}>
            VyapaarMitra AI brings simple profit checks, stock guidance, customer follow-ups
            and voice-led access into one understandable workspace — built for kirana stores,
            neighbourhood grocers and independent retailers.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <Link to={primaryTo} className="btn btn-primary btn-lg">
              {merchant ? 'Open your dashboard →' : 'Set up your shop →'}
            </Link>
            <a href="#modules" className="btn btn-ghost btn-lg">
              See the four modules
            </a>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Runs on seeded demo data · estimates only · nothing is saved without your confirmation.
          </p>
        </section>

        {/* Modules */}
        <section id="modules" style={{ marginTop: '3rem' }}>
          <div className="panel-title">Four connected modules</div>
          <div
            style={{
              display: 'grid',
              gap: 12,
              marginTop: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}
          >
            {MODULES.map((m) => (
              <article className="card" key={m.name} style={{ borderTop: `3px solid ${m.color}` }}>
                <div className="panel-title" style={{ color: m.color }}>
                  {m.tag}
                </div>
                <h3 style={{ fontSize: '1.05rem', marginTop: 5 }}>{m.name}</h3>
                <p className="muted" style={{ fontSize: '0.88rem', marginTop: 8 }}>
                  {m.body}
                </p>
                <p
                  style={{
                    fontSize: '0.82rem',
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px dashed var(--line)',
                    color: 'var(--ink)',
                    fontStyle: 'italic',
                  }}
                >
                  {m.output}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Advisor */}
        <section
          className="card"
          style={{ marginTop: 14, background: 'var(--brand-soft)', borderColor: '#cfe9e0' }}
        >
          <div className="panel-title" style={{ color: 'var(--brand-dark)' }}>
            Unified AI Business Advisor
          </div>
          <p style={{ marginTop: 6, maxWidth: 760 }}>
            A coordination layer — not a fifth system. It reads confirmed shop records and module
            outputs, then explains what you may want to review today. Arithmetic and thresholds
            stay deterministic and traceable; the AI only explains in plain language.
          </p>
        </section>

        {/* Workflow */}
        <section style={{ marginTop: '2.6rem' }}>
          <div className="panel-title">How a shop day works</div>
          <ol
            style={{
              display: 'grid',
              gap: 10,
              marginTop: 10,
              padding: 0,
              listStyle: 'none',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            }}
          >
            {STEPS.map(([title, body], i) => (
              <li className="card card-tight" key={title}>
                <span className="badge badge-mute">{i + 1}</span>
                <div style={{ fontWeight: 650, marginTop: 6 }}>{title}</div>
                <div className="hint">{body}</div>
              </li>
            ))}
          </ol>
        </section>

        <section
          style={{
            marginTop: '2.4rem',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.3rem' }}>
              From scattered notes to one clear daily brief.
            </h2>
            <p className="muted" style={{ marginTop: 6 }}>
              No accounting knowledge required. Short forms, plain language, visible assumptions.
            </p>
          </div>
          <Link to={primaryTo} className="btn btn-primary btn-lg">
            {merchant ? 'Open dashboard →' : 'Start with demo data →'}
          </Link>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--line)', background: '#fff' }}>
        <div
          style={{
            maxWidth: 1080,
            margin: '0 auto',
            padding: '0.9rem 1rem',
            fontSize: '0.8rem',
            color: 'var(--muted)',
          }}
        >
          Assistive decision support — not an accountant, payment provider or inventory
          automation platform. Sample data for judging; no guaranteed outcomes are claimed.
        </div>
      </footer>
    </div>
  )
}
