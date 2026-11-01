import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { BalancesPage } from './pages/BalancesPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { SpendingPage } from './pages/SpendingPage'
import { DashboardPage } from './pages/DashboardPage'
import { LearnPage } from './pages/LearnPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { SchedulesPage } from './pages/SchedulesPage'

// The chart library is most of its weight, so Insights loads only when opened.
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((m) => ({ default: m.InsightsPage })))

function App() {
  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/balances" element={<BalancesPage />} />
        <Route path="/spending" element={<SpendingPage />} />
        <Route
          path="/insights"
          element={
            <Suspense>
              <InsightsPage />
            </Suspense>
          }
        />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="*" element={<Navigate to="/transactions" replace />} />
      </Routes>
    </main>
  )
}

export default App
