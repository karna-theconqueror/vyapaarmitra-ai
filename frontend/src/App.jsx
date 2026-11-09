import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import Shell from './components/Shell.jsx'
import { Spinner } from './components/ui.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Landing from './pages/Landing.jsx'
import Onboarding from './pages/Onboarding.jsx'
import ProfitGuard from './pages/ProfitGuard.jsx'
import Settings from './pages/Settings.jsx'
import StockSense from './pages/StockSense.jsx'
import VoiceDukaan from './pages/VoiceDukaan.jsx'
import Customers from './pages/Customers.jsx'

export default function App() {
  const [merchant, setMerchant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .getMerchant()
      .then((data) => !cancelled && setMerchant(data))
      .catch(() => !cancelled && setMerchant(null))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spinner label="Opening your shop workspace…" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Landing merchant={merchant} />} />
      <Route
        path="/onboarding"
        element={<Onboarding merchant={merchant} onSaved={setMerchant} />}
      />
      <Route
        path="/*"
        element={
          merchant ? (
            <Shell merchant={merchant}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/profit" element={<ProfitGuard />} />
                <Route path="/stock" element={<StockSense />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/voice" element={<VoiceDukaan />} />
                <Route
                  path="/settings"
                  element={<Settings merchant={merchant} onSaved={setMerchant} />}
                />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Shell>
          ) : (
            <Navigate to="/onboarding" replace />
          )
        }
      />
    </Routes>
  )
}
