import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { Field, Logo, Notice } from '../components/ui.jsx'

const BUSINESS_TYPES = [
  'Kirana store',
  'Neighbourhood grocery',
  'Stationery shop',
  'Independent retailer',
  'Other',
]

export default function Onboarding({ merchant, onSaved }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    shop_name: merchant?.shop_name ?? '',
    business_type: merchant?.business_type ?? 'Kirana store',
    owner_name: merchant?.owner_name ?? '',
    language: merchant?.language ?? 'English',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!form.shop_name.trim()) {
      setError('Please enter a shop name.')
      return
    }
    setSaving(true)
    try {
      const saved = merchant
        ? await api.updateMerchant(form)
        : await api.createMerchant(form)
      onSaved(saved)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function useDemoShop() {
    setError(null)
    setSaving(true)
    try {
      if (!merchant) {
        const saved = await api.createMerchant({
          shop_name: 'Sri Balaji Kirana',
          business_type: 'Kirana store',
          owner_name: 'Ramesh',
          language: 'English',
        })
        onSaved(saved)
      }
      await api.loadDemoProducts().catch((err) => {
        if (!String(err.message).includes('already exist')) throw err
      })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem 1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Logo />
          <strong>VyapaarMitra AI</strong>
          <Link to="/" className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem' }}>
            Home
          </Link>
        </div>

        <div className="card">
          <div className="panel-title">Shop setup</div>
          <h1 style={{ fontSize: '1.45rem', marginTop: 6 }}>
            {merchant ? 'Update your shop profile' : 'Tell us about your shop'}
          </h1>
          <p className="muted" style={{ fontSize: '0.88rem', marginTop: 8 }}>
            A short setup — four fields. Everything stays editable later in Settings.
          </p>

          <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 18 }}>
            <Field label="Shop name *" hint="Shown across your workspace">
              <input
                className="input"
                value={form.shop_name}
                onChange={set('shop_name')}
                placeholder="e.g. Sri Balaji Kirana"
                maxLength={120}
                required
              />
            </Field>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Business type">
                <select className="select" value={form.business_type} onChange={set('business_type')}>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred language">
                <select className="select" value={form.language} onChange={set('language')}>
                  {['English', 'Hindi', 'Hinglish'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Owner name (optional)" hint="Used for greetings in the daily brief">
              <input
                className="input"
                value={form.owner_name}
                onChange={set('owner_name')}
                placeholder="e.g. Ramesh"
                maxLength={120}
              />
            </Field>

            {error ? <Notice kind="err">{error}</Notice> : null}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : merchant ? 'Save profile' : 'Create shop & continue'}
              </button>
              {!merchant ? (
                <button className="btn btn-ghost" type="button" onClick={useDemoShop} disabled={saving}>
                  Load seeded demo shop
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
          Demo prototype · sample data · you review and decide
        </p>
      </div>
    </div>
  )
}
