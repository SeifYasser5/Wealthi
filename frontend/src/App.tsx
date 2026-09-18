import { Navigate, Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { BalancesPage } from './pages/BalancesPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { SpendingPage } from './pages/SpendingPage'

function App() {
  return (
    <main className="min-h-screen bg-background">
      <NavBar />
      <Routes>
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/balances" element={<BalancesPage />} />
        <Route path="/spending" element={<SpendingPage />} />
        <Route path="*" element={<Navigate to="/transactions" replace />} />
      </Routes>
    </main>
  )
}

export default App
