import { useState } from 'react'
import { api } from '../api.js'
import { MarginBarChart } from '../components/Charts.jsx'
import { Empty, Field, Modal, Notice, Spinner, Stat } from '../components/ui.jsx'
import { MARGIN_STATUS, inr, pct, todayISO } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'

const EMPTY_PRODUCT = {
  name: '',
  unit: 'unit',
  purchase_cost: '',
  selling_price: '',
  quantity: 0,
  min_threshold: 5,
  target_stock: '',
}

export default function ProfitGuard() {
  const profit = useAsync(() => api.profitProducts())
  const summary = useAsync(() => api.profitSummary())
  const products = useAsync(() => api.products())

  const [notice, setNotice] = useState(null)
  const [showProduct, setShowProduct] = useState(false)
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT)
  const [saleForm, setSaleForm] = useState({
    product_id: '',
    quantity: 1,
    unit_price: '',
    sale_date: todayISO(),
    note: '',
  })
  const [busy, setBusy] = useState(false)

  const rows = profit.data?.rows ?? []
  const flagged = profit.data?.flagged ?? []

  function flash(kind, text) {
    setNotice({ kind, text })
    if (kind === 'ok') setTimeout(() => setNotice(null), 4000)
  }

  async function submitSale(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        product_id: Number(saleForm.product_id),
        quantity: Number(saleForm.quantity),
        sale_date: saleForm.sale_date || todayISO(),
        note: saleForm.note || null,
      }
      if (saleForm.unit_price !== '') payload.unit_price = Number(saleForm.unit_price)
      const sale = await api.createSale(payload)
      flash('ok', `Sale recorded — stock and estimates updated for sale #${sale.id}.`)
      setSaleForm((f) => ({ ...f, quantity: 1, note: '' }))
      profit.reload()
      summary.reload()
      products.reload()
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitProduct(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        name: productForm.name.trim(),
        unit: productForm.unit || 'unit',
        purchase_cost: productForm.purchase_cost === '' ? null : Number(productForm.purchase_cost),
        selling_price: productForm.selling_price === '' ? null : Number(productForm.selling_price),
        quantity: Number(productForm.quantity || 0),
        min_threshold: Number(productForm.min_threshold || 0),
        target_stock: productForm.target_stock === '' ? null : Number(productForm.target_stock),
      }
      await api.createProduct(payload)
      flash('ok', `${payload.name} added to your catalogue.`)
      setProductForm(EMPTY_PRODUCT)
      setShowProduct(false)
      profit.reload()
      products.reload()
    } catch (err) {
      flash('err', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeProduct(row) {
    if (!window.confirm(`Delete "${row.name}" and its sales history? This cannot be undone.`)) return
    try {
      await api.deleteProduct(row.id)
      flash('ok', `${row.name} removed.`)
      profit.reload()
      summary.reload()
      products.reload()
    } catch (err) {
      flash('err', err.message)
    }
  }

  const selectedProduct = (products.data ?? []).find(
    (p) => p.id === Number(saleForm.product_id),
  )

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <PageHead
        title="ProfitGuard"
        subtitle="Profit clarity without full accounting — every number is an estimate from your entered values."
        action={
          <button className="btn btn-primary" onClick={() => setShowProduct(true)}>
            + Add product
          </button>
        }
      />

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
      {profit.error ? <Notice kind="err">{profit.error}</Notice> : null}

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Stat label="Revenue (today)" value={inr(summary.data?.revenue)} sub={`${summary.data?.sales_count ?? 0} sale(s)`} />
        <Stat
          label="Est. gross profit"
          value={summary.data?.estimated_gross_profit == null ? '—' : inr(summary.data.estimated_gross_profit)}
          sub="Not audited profit"
          tone="good"
        />
        <Stat
          label="Flagged margins"
          value={flagged.length}
          sub="Weak or negative estimated margin"
          tone={flagged.length ? 'warn' : 'plain'}
        />
        <Stat label="Products listed" value={summary.data?.products_listed ?? '—'} sub="With cost & price on file" />
      </div>

      {/* Flagged margins */}
      <section className="card">
        <div className="panel-title">Needs a look — weak or negative estimated margin</div>
        {flagged.length === 0 ? (
          <Empty title="No weak margins found">All listed items show a healthy estimated margin.</Empty>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Cost</th>
                  <th className="num">Price</th>
                  <th className="num">Margin</th>
                  <th>Status</th>
                  <th>Suggested review</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td className="num">{r.missing_cost ? '—' : inr(r.purchase_cost, { decimals: 2 })}</td>
                    <td className="num">{r.missing_price ? '—' : inr(r.selling_price, { decimals: 2 })}</td>
                    <td className="num">{pct(r.gross_margin_pct)}</td>
                    <td>
                      <span className={`badge ${MARGIN_STATUS[r.margin_status].className}`}>
                        {MARGIN_STATUS[r.margin_status].label}
                      </span>
                    </td>
                    <td className="muted">Review cost, price or discount</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Profitability table + record sale */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <section className="card" style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div className="panel-title">Record a sale</div>
          <p className="hint" style={{ marginTop: 4 }}>
            Reduces stock and refreshes your profit estimate immediately.
          </p>
          <form onSubmit={submitSale} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <Field label="Product *">
              <select
                className="select"
                required
                value={saleForm.product_id}
                onChange={(e) => {
                  const id = e.target.value
                  const p = (products.data ?? []).find((x) => x.id === Number(id))
                  setSaleForm((f) => ({
                    ...f,
                    product_id: id,
                    unit_price: p?.selling_price ?? '',
                  }))
                }}
              >
                <option value="">Choose a product…</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (stock: {p.quantity} {p.unit})
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Quantity sold *">
                <input
                  className="input"
                  type="number"
                  min="1"
                  required
                  value={saleForm.quantity}
                  onChange={(e) => setSaleForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
              <Field
                label="Selling price (₹)"
                hint={selectedProduct ? `Prefilled from product: ${inr(selectedProduct.selling_price)}` : 'Defaults to product price'}
              >
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={saleForm.unit_price}
                  onChange={(e) => setSaleForm((f) => ({ ...f, unit_price: e.target.value }))}
                  placeholder="auto"
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Sale date">
                <input
                  className="input"
                  type="date"
                  value={saleForm.sale_date}
                  onChange={(e) => setSaleForm((f) => ({ ...f, sale_date: e.target.value }))}
                />
              </Field>
              <Field label="Note (optional)">
                <input
                  className="input"
                  value={saleForm.note}
                  maxLength={80}
                  onChange={(e) => setSaleForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. morning rush"
                />
              </Field>
            </div>

            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Record sale'}
            </button>
            <p className="hint">
              Estimated gross profit = (selling price − purchase cost) × quantity sold.
            </p>
          </form>
        </section>

        <section className="card" style={{ flex: '3 1 560px', minWidth: 0 }}>
          <div className="panel-title">Product profitability</div>
          {profit.loading && !profit.data ? (
            <Spinner label="Calculating margins…" />
          ) : rows.length === 0 ? (
            <Empty title="No products yet">
              Add your first product with cost and selling price to see estimated margins.
            </Empty>
          ) : (
            <>
              <div style={{ marginTop: 10, marginBottom: 6 }}>
                <MarginBarChart rows={rows} />
                <p className="hint" style={{ marginTop: 4 }}>
                  Estimated gross margin % — green healthy, amber weak (&lt;10%), red negative.
                </p>
              </div>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Sold</th>
                    <th className="num">Revenue</th>
                    <th className="num">Est. profit</th>
                    <th className="num">Margin</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        <div className="hint">
                          cost {r.missing_cost ? '—' : inr(r.purchase_cost, { decimals: 2 })} · price{' '}
                          {r.missing_price ? '—' : inr(r.selling_price, { decimals: 2 })} · stock {r.quantity}
                        </div>
                      </td>
                      <td className="num">{r.qty_sold}</td>
                      <td className="num">{inr(r.revenue)}</td>
                      <td className="num">
                        {r.estimated_gross_profit == null ? (
                          <span className="badge badge-mute">missing data</span>
                        ) : (
                          <span
                            style={{
                              color: r.estimated_gross_profit < 0 ? 'var(--danger)' : 'inherit',
                            }}
                          >
                            {inr(r.estimated_gross_profit)}
                          </span>
                        )}
                      </td>
                      <td className="num">{pct(r.gross_margin_pct)}</td>
                      <td>
                        <span className={`badge ${MARGIN_STATUS[r.margin_status].className}`}>
                          {MARGIN_STATUS[r.margin_status].label}
                        </span>
                      </td>
                      <td className="num">
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => removeProduct(r)}
                          aria-label={`Delete ${r.name}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
          <p className="hint" style={{ marginTop: 8 }}>
            {profit.data?.note} Not audited profit, tax compliance or cash-flow forecasting.
          </p>
        </section>
      </div>

      {showProduct ? (
        <Modal title="Add product" onClose={() => setShowProduct(false)}>
          <form onSubmit={submitProduct} style={{ display: 'grid', gap: 10 }}>
            <Field label="Product name *">
              <input
                className="input"
                required
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Tea 500g"
                maxLength={120}
              />
            </Field>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Unit">
                <input
                  className="input"
                  value={productForm.unit}
                  onChange={(e) => setProductForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="packet / kg / piece"
                />
              </Field>
              <Field label="Current quantity">
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={productForm.quantity}
                  onChange={(e) => setProductForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
              <Field label="Purchase cost (₹)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.purchase_cost}
                  onChange={(e) => setProductForm((f) => ({ ...f, purchase_cost: e.target.value }))}
                />
              </Field>
              <Field label="Selling price (₹)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.selling_price}
                  onChange={(e) => setProductForm((f) => ({ ...f, selling_price: e.target.value }))}
                />
              </Field>
              <Field label="Alert level" hint="Flag at or below this">
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={productForm.min_threshold}
                  onChange={(e) => setProductForm((f) => ({ ...f, min_threshold: e.target.value }))}
                />
              </Field>
              <Field label="Target stock (optional)" hint="Enables reorder suggestion">
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={productForm.target_stock}
                  onChange={(e) => setProductForm((f) => ({ ...f, target_stock: e.target.value }))}
                  placeholder="none"
                />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Adding…' : 'Add product'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowProduct(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

function PageHead({ title, subtitle, action }) {
  return (
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
        <h1 style={{ fontSize: '1.5rem', marginTop: 4 }}>{title}</h1>
        <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4, maxWidth: 640 }}>
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  )
}
