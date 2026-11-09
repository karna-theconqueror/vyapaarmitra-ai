import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { Field, Notice } from '../components/ui.jsx'

const BOUNDARIES = [
  'No guaranteed profit growth, automatic optimisation or demand prediction.',
  'No supplier ordering, payments, or tax and accounting compliance.',
  'Voice recognition can mishear names and quantities — always confirm.',
  'Customer contact data is minimised and used only for the explained purpose.',
  'Sample data is used for judging unless a merchant explicitly agrees to participate.',
]

export default function Settings({ merchant, onSaved }) {
  const [form, setForm] = useState({
    shop_name: merchant?.shop_name ?? '',
    business_type: merchant?.business_type ?? '',
    owner_name: merchant?.owner_name ?? '',
    language: merchant?.language ?? 'English',
  })
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  function flash(kind, text) {
    setNotice({ kind, text })
    if (kind === 'ok') setTimeout(() => setNotice(null), 4500)
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function saveProfile(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const saved = await api.updateMerchant(form)
      onSaved(saved)
      flash('ok', 'Shop profile updated.')
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function exportData() {
    try {
      const data = await api.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'vyapaarmitra-export.json'
      anchor.click()
      URL.revokeObjectURL(url)
      flash('ok', 'Export downloaded as vyapaarmitra-export.json')
    } catch (err) {
      flash('err', err.message)
    }
  }

  async function resetData() {
    if (!window.confirm('Reset all data back to the seeded demo shop? Your changes will be lost.'))
      return
    setBusy(true)
    try {
      await api.resetData()
      flash('ok', 'Demo data restored. Reloading…')
      setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      flash('err', err.message)
      setBusy(false)
    }
  }

  async function loadDemoProducts() {
    setBusy(true)
    try {
      await api.loadDemoProducts()
      flash('ok', 'Demo products loaded.')
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div className="panel-title">Workspace</div>
        <h1 style={{ fontSize: '1.5rem', marginTop: 4 }}>Settings & data</h1>
        <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4, maxWidth: 640 }}>
          Shop profile, data controls and the privacy promise behind this prototype.
        </p>
      </div>

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        <section className="card">
          <div className="panel-title">Shop profile</div>
          <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <Field label="Shop name *">
              <input className="input" required value={form.shop_name} onChange={set('shop_name')} maxLength={120} />
            </Field>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Business type">
                <input className="input" value={form.business_type} onChange={set('business_type')} maxLength={60} />
              </Field>
              <Field label="Language">
                <select className="select" value={form.language} onChange={set('language')}>
                  {['English', 'Hindi', 'Hinglish'].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Owner name">
              <input className="input" value={form.owner_name} onChange={set('owner_name')} maxLength={120} />
            </Field>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
            <Link to="/onboarding" className="hint" style={{ textDecoration: 'none' }}>
              Re-run guided setup →
            </Link>
          </form>
        </section>

        <section className="card">
          <div className="panel-title">Data controls</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <div className="card card-tight" style={{ background: '#fdfbf7' }}>
              <strong style={{ fontSize: '0.9rem' }}>Export everything</strong>
              <p className="hint" style={{ marginTop: 3 }}>
                Download your shop, product, sales, stock, customer and follow-up records as JSON.
              </p>
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={exportData}>
                Download JSON export
              </button>
            </div>

            <div className="card card-tight" style={{ background: '#fdfbf7' }}>
              <strong style={{ fontSize: '0.9rem' }}>Reset to demo data</strong>
              <p className="hint" style={{ marginTop: 3 }}>
                Restores the seeded sample shop (Sri Balaji Kirana) and clears your changes.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-danger" onClick={resetData} disabled={busy}>
                  Reset demo data
                </button>
                <button className="btn btn-ghost" onClick={loadDemoProducts} disabled={busy}>
                  Load demo products only
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-title">Privacy notice</div>
          <p style={{ marginTop: 8, fontSize: '0.9rem', maxWidth: 780 }}>
            Customer information is used only for the explained purpose — a due follow-up list
            and an editable message you send yourself. Keep contact details minimal, store them
            with permission, and remove anything you no longer need. The AI advisor receives
            only the minimum relevant summary fields; arithmetic and thresholds are computed
            locally and stay traceable.
          </p>
          <ul style={{ marginTop: 10, paddingLeft: 18, display: 'grid', gap: 5, fontSize: '0.88rem', color: 'var(--muted)' }}>
            {BOUNDARIES.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-title">About this prototype</div>
          <div
            style={{
              display: 'grid',
              gap: 12,
              marginTop: 8,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              fontSize: '0.88rem',
            }}
          >
            <div>
              <strong>Stack</strong>
              <p className="muted">React + Vite · Tailwind · FastAPI · SQLite</p>
            </div>
            <div>
              <strong>Advisor mode</strong>
              <p className="muted">
                Rules-only fallback (deterministic). Optional LLM polish via ADVISOR_LLM_URL /
                ADVISOR_LLM_KEY / ADVISOR_LLM_MODEL.
              </p>
            </div>
            <div>
              <strong>API docs</strong>
              <p className="muted">
                Interactive endpoint reference at <code>/docs</code> on the API server.
              </p>
            </div>
            <div>
              <strong>Status</strong>
              <p className="muted">Hackathon MVP · demo data · estimates only</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
