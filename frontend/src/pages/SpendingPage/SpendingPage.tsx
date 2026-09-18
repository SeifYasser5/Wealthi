import { CategoryCard } from './components/CategoryCard'
import { CategorySelect } from './components/CategorySelect'
import { SpendingBar } from './components/SpendingBar'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { UpdatingIndicator } from '../../components/UpdatingIndicator'
import { useFilters } from '../../hooks/useFilters'
import { useSpending } from '../../hooks/useSpending'
import { money, plural } from '../../utils/utils'

export function SpendingPage() {
  const { filters, update } = useFilters()
  const query = useSpending(filters.yearMonth)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader
        title="Spending"
        yearMonth={filters.yearMonth}
        onYearMonthChange={(ym) => update({ yearMonth: ym })}
      />

      <QueryState
        query={query}
        isEmpty={(data) => data.categories.length === 0}
        errorMessage="Failed to load spending data"
        emptyMessage="No spending data for this month."
      >
        {(data) => (
          <>
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm text-muted">
                {plural(data.categories.length, 'category', 'categories')}
                {data.largeTransactions.length > 0 && (
                  <span className="ml-2 text-warning">· {data.largeTransactions.length} large</span>
                )}
                <UpdatingIndicator query={query} className="ml-2" />
              </span>
              <span className="font-semibold text-foreground">
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
                    <div key={`tx-${item.tx.id}`} className="overflow-hidden rounded-2xl bg-surface px-5 py-4">
                      <SpendingBar
                        label={item.tx.merchant ?? item.tx.account}
                        badge="large"
                        amount={item.tx.amount}
                        pct={item.tx.pct}
                        accent="warning"
                        footer={
                          <>
                            <span>{item.tx.pct.toFixed(1)}% of total · single transaction</span>
                            {/* Large rows are uncategorized by definition — they are listed here
                                instead of inside the Uncategorized bucket, so the dropdown lives here. */}
                            <CategorySelect transactionId={item.tx.id} />
                          </>
                        }
                      />
                    </div>
                  ),
                )}
            </div>
          </>
        )}
      </QueryState>
    </div>
  )
}
