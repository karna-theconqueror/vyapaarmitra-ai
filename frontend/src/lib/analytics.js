/** Client-side aggregations for the P2 charts.
 *  All figures derive from recorded sales and entered product costs —
 *  the same deterministic numbers ProfitGuard shows in its tables. */

const DAY_MS = 86400000

function isoDay(date) {
  const off = date.getTimezoneOffset()
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 10)
}

/** Revenue + estimated gross profit for the last `days` calendar days. */
export function dailyTrend(sales, costByProduct, days = 7) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const buckets = []

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY_MS)
    buckets.push({
      key: isoDay(day),
      label: day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
      revenue: 0,
      profit: 0,
      sales: 0,
    })
  }

  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]))
  for (const sale of sales) {
    const bucket = byKey[sale.sale_date]
    if (!bucket) continue
    const cost = costByProduct[sale.product_id]
    bucket.revenue += sale.unit_price * sale.quantity
    bucket.sales += 1
    if (cost !== undefined && cost !== null) {
      bucket.profit += (sale.unit_price - cost) * sale.quantity
    }
  }

  return buckets.map((b) => ({
    ...b,
    revenue: Math.round(b.revenue * 100) / 100,
    profit: Math.round(b.profit * 100) / 100,
  }))
}

/** { productId: purchase_cost } for trend profit maths. */
export function costMap(profitRows = []) {
  return Object.fromEntries(
    profitRows.map((r) => [r.id, r.purchase_cost]),
  )
}
