import { BalancesTable } from './components/BalancesTable'
import { MonthNavigator } from '../../components/MonthNavigator'
import { QueryState } from '../../components/QueryState'
import { useFilters } from '../../hooks/useFilters'
import { useBalances } from '../../hooks/useBalances'

export function BalancesPage() {
  const { filters, update } = useFilters()
  const query = useBalances(filters.yearMonth)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-black">Balances</h1>
        <MonthNavigator yearMonth={filters.yearMonth} onChange={(ym) => update({ yearMonth: ym })} />
      </header>

      <div className="mb-3 flex items-center justify-end text-sm text-[#9a9ba8]">
        {query.isFetching && !query.isLoading && <span className="text-[#0666eb]">Updating…</span>}
      </div>

      <QueryState
        query={query}
        isEmpty={(data) => data.balances.length === 0}
        errorMessage="Failed to load balances"
        emptyMessage="No balance snapshots for this month."
      >
        {(data) => <BalancesTable balances={data.balances} />}
      </QueryState>
    </div>
  )
}
