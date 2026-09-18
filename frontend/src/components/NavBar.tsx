import { NavLink, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/transactions', label: 'Transactions' },
  { to: '/balances', label: 'Balances' },
  { to: '/spending', label: 'Spending' },
]

export function NavBar() {
  const { search } = useLocation()

  return (
    <nav className="sticky top-0 z-10 bg-background">
      <div className="mx-auto flex max-w-5xl gap-1 px-4">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={{ pathname: tab.to, search }}
            className={({ isActive }) =>
              `px-6 py-5 tracking-widest text-base font-semibold uppercase transition focus:outline-none ${
                isActive ? 'text-foreground' : 'text-subtle hover:text-foreground'
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
