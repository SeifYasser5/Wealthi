import { BalancesTable } from './components/BalancesTable'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { UpdatingIndicator } from '../../components/UpdatingIndicator'
import { useFilters } from '../../hooks/useFilters'
import { useBalances } from '../../hooks/useBalances'

export function BalancesPage() {
  const { filters, update } = useFilters()
  const query = useBalances(filters.yearMonth)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader
        title="Balances"
        yearMonth={filters.yearMonth}
        onYearMonthChange={(ym) => update({ yearMonth: ym })}
      />

      <div className="mb-3 flex items-center justify-end text-sm text-muted">
        <UpdatingIndicator query={query} />
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
