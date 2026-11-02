import { NavLink, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/transactions', label: 'Transactions' },
  { to: '/balances', label: 'Balances' },
  { to: '/spending', label: 'Spending' },
  { to: '/insights', label: 'Insights' },
  { to: '/categories', label: 'Categories' },
  { to: '/schedules', label: 'Schedules' },
  { to: '/settings', label: 'Settings' },
]

/** The sticky top bar: wordmark on the left, the pages as a pill segmented control. */
export function NavBar() {
  const { search } = useLocation()

  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-glass backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <span className="hidden text-lg font-semibold tracking-tight text-foreground sm:block">Wealthi</span>
        <div className="-mx-1 flex min-w-0 flex-1 justify-start overflow-x-auto px-1 sm:justify-center">
          <div className="flex gap-1 rounded-full bg-surface p-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={{ pathname: tab.to, search }}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    isActive ? 'bg-surface-hover text-foreground' : 'text-subtle hover:text-foreground'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>
        {/* Balances the wordmark so the pill sits in the true centre. */}
        <span aria-hidden className="hidden w-24 sm:block" />
      </div>
    </nav>
  )
}
