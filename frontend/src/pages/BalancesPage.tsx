import { BalancesTable } from '../components/BalancesTable'
import { MonthNavigator } from '../components/MonthNavigator'
import { useFilters } from '../hooks/useFilters'
import { useBalances } from '../hooks/useBalances'

export function BalancesPage() {
  const { filters, update } = useFilters()
  const { data, isLoading, isError, error, isFetching } = useBalances(filters.yearMonth)

  const balances = data?.balances ?? []

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-black">Balances</h1>
        <MonthNavigator yearMonth={filters.yearMonth} onChange={(ym) => update({ yearMonth: ym })} />
      </header>

      <div className="mb-3 flex items-center justify-between text-sm text-[#9a9ba8]">
        {/* <span>{data ? `${data.count} account${data.count === 1 ? '' : 's'}` : ''}</span> */}
        {isFetching && !isLoading && <span className="text-[#0666eb]">Updating…</span>}
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-[#f0f0f3] py-16 text-center text-[#9a9ba8]">Loading…</div>
      ) : isError ? (
        <div className="rounded-2xl bg-[#ff3b30]/10 py-16 text-center text-[#ff3b30]">
          {error instanceof Error ? error.message : 'Failed to load balances'}
        </div>
      ) : balances.length === 0 ? (
        <div className="rounded-2xl bg-[#f0f0f3] py-16 text-center text-[#9a9ba8]">
          No balance snapshots for this month.
        </div>
      ) : (
        <BalancesTable balances={balances} />
      )}
    </div>
  )
}
