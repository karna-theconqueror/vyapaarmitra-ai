// API base: same-origin "/api" in dev (Vite proxy) and local runs.
// For a hosted frontend pointing at a separate API host, set the
// VITE_API_BASE build/env variable to the absolute URL (no trailing slash).
const BASE = import.meta.env.VITE_API_BASE || '/api'

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null

  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
          : `Request failed (${res.status})`
    throw new Error(message)
  }
  return data
}

export const api = {
  // merchant / profile
  getMerchant: () => request('/merchant'),
  createMerchant: (payload) => request('/merchant', { method: 'POST', body: payload }),
  updateMerchant: (payload) => request('/merchant', { method: 'PUT', body: payload }),
  loadDemoProducts: () => request('/merchant/demo-products', { method: 'POST' }),

  // ProfitGuard
  products: () => request('/products'),
  createProduct: (payload) => request('/products', { method: 'POST', body: payload }),
  updateProduct: (id, payload) => request(`/products/${id}`, { method: 'PUT', body: payload }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  sales: (day) => request(`/sales${day ? `?day=${day}` : ''}`),
  createSale: (payload) => request('/sales', { method: 'POST', body: payload }),
  profitProducts: () => request('/profit/products'),
  profitSummary: (day) => request(`/profit/summary${day ? `?day=${day}` : ''}`),

  // StockSense
  stockAlerts: () => request('/stock/alerts'),
  adjustStock: (payload) => request('/stock/adjust', { method: 'POST', body: payload }),
  movements: () => request('/stock/movements'),

  // Customer Comeback
  customers: () => request('/customers'),
  createCustomer: (payload) => request('/customers', { method: 'POST', body: payload }),
  updateCustomer: (id, payload) => request(`/customers/${id}`, { method: 'PUT', body: payload }),
  deleteCustomer: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
  followups: (status = 'due') => request(`/followups?status=${status}`),
  createFollowup: (payload) => request('/followups', { method: 'POST', body: payload }),
  updateFollowup: (id, payload) => request(`/followups/${id}`, { method: 'PUT', body: payload }),
  completeFollowup: (id, payload) =>
    request(`/followups/${id}/complete`, { method: 'POST', body: payload }),

  // Advisor / dashboard
  dailyBrief: () => request('/advisor/daily-brief'),
  dashboard: () => request('/dashboard'),

  // Settings / data controls
  exportData: () => request('/data/export'),
  resetData: () => request('/data/reset', { method: 'POST' }),
}
