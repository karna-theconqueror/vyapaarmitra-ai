import { useState } from 'react'
import { api } from '../api.js'
import { Empty, Field, Notice, Spinner, Stat } from '../components/ui.jsx'
import { useAsync } from '../lib/useAsync.js'

const REASONS = ['Delivery', 'Sale correction', 'Damaged / wastage', 'Manual count']

export default function StockSense() {
  const alerts = useAsync(() => api.stockAlerts())
  const products = useAsync(() => api.products())
  const movements = useAsync(() => api.movements())

  const [form, setForm] = useState({
    product_id: '',
    direction: 'in',
    quantity: 1,
    reason: 'Delivery',
  })
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  function flash(kind, text) {
    setNotice({ kind, text })
    if (kind === 'ok') setTimeout(() => setNotice(null), 4500)
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.product_id) return flash('err', 'Choose a product first.')
    const qty = Number(form.quantity)
    if (!qty || qty <= 0) return flash('err', 'Enter a quantity greater than zero.')
    setBusy(true)
    try {
      const change = form.direction === 'in' ? qty : -qty
      const result = await api.adjustStock({
        product_id: Number(form.product_id),
        quantity_change: change,
        reason: form.reason,
      })
      flash('ok', result.message)
      alerts.reload()
      products.reload()
      movements.reload()
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  const rows = products.data ?? []
  const alertList = alerts.data?.alerts ?? []

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="panel-title">Module</div>
          <h1 style={{ fontSize: '1.5rem', marginTop: 4 }}>StockSense</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4, maxWidth: 640 }}>
            Know what may need replenishing — using your own alert levels. No demand forecasting
            and no automatic supplier ordering.
          </p>
        </div>
        <span className="badge badge-mute">Thresholds are yours</span>
      </div>

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
      {alerts.error ? <Notice kind="err">{alerts.error}</Notice> : null}

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Stat
          label="Items below alert level"
          value={alerts.data?.count ?? '—'}
          sub="At or below your minimum"
          tone={alerts.data?.count ? 'warn' : 'plain'}
        />
        <Stat label="Products tracked" value={rows.length} sub="In your catalogue" />
        <Stat
          label="Out of stock"
          value={alertList.filter((a) => a.level === 'out_of_stock').length}
          sub="Zero quantity on hand"
          tone="bad"
        />
        <Stat
          label="Movements logged"
          value={movements.data?.length ?? '—'}
          sub="Latest recorded changes"
        />
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        {/* Alerts */}
        <section className="card">
          <div className="panel-title">Low-stock alerts</div>
          {alerts.loading && !alerts.data ? (
            <Spinner label="Checking thresholds…" />
          ) : alertList.length === 0 ? (
            <Empty title="All items are above your alert level">
              Nothing needs replenishing right now.
            </Empty>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 8, display: 'grid', gap: 8 }}>
              {alertList.map((a) => (
                <li
                  key={a.product_id}
                  className="card card-tight"
                  style={{
                    borderColor: a.level === 'low' ? '#f3ddb8' : '#f6d4d4',
                    background: a.level === 'low' ? '#fffdf8' : '#fffafa',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${a.level === 'low' ? 'badge-warn' : 'badge-crit'}`}>
                      {a.level.replace('_', ' ')}
                    </span>
                    <strong>{a.name}</strong>
                  </div>
                  <p style={{ fontSize: '0.87rem', marginTop: 6 }}>{a.explanation}</p>
                  <p className="hint" style={{ marginTop: 4 }}>
                    Basis: quantity {a.quantity} {a.unit}(s) vs alert level {a.min_threshold}
                    {a.target_stock ? ` · target ${a.target_stock}` : ''}
                    {a.suggested_reorder !== null
                      ? ` · suggested reorder ${a.suggested_reorder} ${a.unit}(s)`
                      : ' · no target set, so no reorder suggestion'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Adjust stock */}
        <section className="card">
          <div className="panel-title">Stock adjustment</div>
          <p className="hint" style={{ marginTop: 4 }}>
            Every change is recorded with a reason and shown in the movement list.
          </p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <Field label="Product *">
              <select
                className="select"
                required
                value={form.product_id}
                onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              >
                <option value="">Choose a product…</option>
                {rows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (stock: {p.quantity} {p.unit})
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Direction">
                <select
                  className="select"
                  value={form.direction}
                  onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
                >
                  <option value="in">Stock in (+)</option>
                  <option value="out">Stock out (−)</option>
                </select>
              </Field>
              <Field label="Quantity">
                <input
                  className="input"
                  type="number"
                  min="1"
                  required
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
            </div>

            <Field label="Reason">
              <select
                className="select"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              >
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>

            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Updating…' : 'Update stock'}
            </button>
          </form>
        </section>

        {/* Stock list */}
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-title">Stock list</div>
          {products.loading && !products.data ? (
            <Spinner label="Loading stock…" />
          ) : rows.length === 0 ? (
            <Empty title="No products yet">Add products in ProfitGuard to track stock.</Empty>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Quantity</th>
                    <th className="num">Alert level</th>
                    <th className="num">Target</th>
                    <th className="num">Suggested reorder</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const alert = alertList.find((a) => a.product_id === p.id)
                    const reorder = p.target_stock != null ? Math.max(p.target_stock - p.quantity, 0) : null
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <div className="hint">per {p.unit}</div>
                        </td>
                        <td className="num">{p.quantity}</td>
                        <td className="num">{p.min_threshold}</td>
                        <td className="num">{p.target_stock ?? '—'}</td>
                        <td className="num">{reorder ?? '—'}</td>
                        <td>
                          {alert ? (
                            <span className={`badge ${alert.level === 'low' ? 'badge-warn' : 'badge-crit'}`}>
                              {alert.level.replace('_', ' ')}
                            </span>
                          ) : (
                            <span className="badge badge-ok">ok</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Movements */}
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-title">Recent stock movements</div>
          {movements.loading && !movements.data ? (
            <Spinner label="Loading movements…" />
          ) : !movements.data || movements.data.length === 0 ? (
            <Empty title="No movements yet">Stock adjustments will appear here.</Empty>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th className="num">Change</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data.slice(0, 10).map((m) => (
                    <tr key={m.id}>
                      <td className="muted">
                        {new Date(m.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>{m.product_name}</td>
                      <td
                        className="num"
                        style={{ color: m.quantity_change < 0 ? 'var(--danger)' : 'var(--brand)' }}
                      >
                        {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                      </td>
                      <td className="muted">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint" style={{ marginTop: 8 }}>
            Showing the latest 10 movements. Every quantity change keeps its reason visible.
          </p>
        </section>
      </div>
    </div>
  )
}
