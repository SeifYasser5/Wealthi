import { CategoryCard } from '../components/CategoryCard'
import { LargeTransactionCard } from '../components/LargeTransactionCard'
import { MonthNavigator } from '../components/MonthNavigator'
import { QueryState } from '../components/QueryState'
import { useFilters } from '../hooks/useFilters'
import { useSpending } from '../hooks/useSpending'
import { money } from '../utils/utils'

export function SpendingPage() {
  const { filters, update } = useFilters()
  const query = useSpending(filters.yearMonth)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-black">Spending</h1>
        <MonthNavigator yearMonth={filters.yearMonth} onChange={(ym) => update({ yearMonth: ym })} />
      </header>

      <QueryState
        query={query}
        isEmpty={(data) => data.categories.length === 0}
        errorMessage="Failed to load spending data"
        emptyMessage="No spending data for this month."
        surface="bg-[#f4f5f7]"
      >
        {(data) => (
          <>
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm text-[#9a9ba8]">
                {data.categories.length} categor{data.categories.length !== 1 ? 'ies' : 'y'}
                {data.largeTransactions.length > 0 && (
                  <span className="ml-2 text-[#ff9500]">· {data.largeTransactions.length} large</span>
                )}
                {query.isFetching && <span className="ml-2 text-[#0666eb]">Updating…</span>}
              </span>
              <span className="font-semibold text-black">
                Total <span className="font-mono">{money(data.grandTotal)}</span>
              </span>
            </div>

            <div className="space-y-2">
              {/* Categories and promoted single transactions interleave by size. */}
              {[
                ...data.categories.map((row) => ({ kind: 'category' as const, row, sortKey: row.total })),
                ...data.largeTransactions.map((tx) => ({ kind: 'large-tx' as const, tx, sortKey: tx.amount })),
              ]
                .sort((a, b) => b.sortKey - a.sortKey)
                .map((item) =>
                  item.kind === 'category' ? (
                    <CategoryCard
                      key={`cat-${item.row.category}`}
                      row={item.row}
                      grandTotal={data.grandTotal}
                      uncategorized={data.uncategorized}
                    />
                  ) : (
                    <LargeTransactionCard key={`tx-${item.tx.id}`} tx={item.tx} />
                  ),
                )}
            </div>
          </>
        )}
      </QueryState>
    </div>
  )
}
