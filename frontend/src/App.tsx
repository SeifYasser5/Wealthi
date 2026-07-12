import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BalancesPage } from './pages/BalancesPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { SpendingPage } from './pages/SpendingPage'

const TABS = [
  { to: '/transactions', label: 'Transactions' },
  { to: '/balances', label: 'Balances' },
  { to: '/spending', label: 'Spending' },
]

function NavBar() {
  const { search } = useLocation()

  return (
    <nav className="sticky top-0 z-10 bg-white">
      <div className="mx-auto flex max-w-5xl gap-1 px-4">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={{ pathname: tab.to, search }}
            className={({ isActive }) =>
              `px-6 py-5 tracking-widest text-base font-semibold uppercase transition focus:outline-none ${
                isActive ? 'text-black' : 'text-[#6b6d80] hover:text-black'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function App() {
  return (
    <main className="min-h-screen bg-white">
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
