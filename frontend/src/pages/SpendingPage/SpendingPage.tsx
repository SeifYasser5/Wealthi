import { useState } from 'react'
import { CategoryCard } from './components/CategoryCard'
import { CategorySelect } from './components/CategorySelect'
import { BudgetView } from './components/BudgetView'
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
  const [budgeting, setBudgeting] = useState(false)

  return (
    // From md up the page is exactly the viewport under the NavBar (h-16 plus its
    // 1px border), so the list scrolls inside it and the month and total never leave view.
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-4 md:flex md:h-[calc(100dvh-4rem-1px)] md:flex-col">
      <PageHeader
        compact
        center={
          <div role="tablist" aria-label="Spending view" className="flex rounded-full bg-surface p-1">
            {[
              { id: false, label: 'Spending' },
              { id: true, label: 'Budget' },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={t.id === budgeting}
                onClick={() => setBudgeting(t.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  t.id === budgeting ? 'bg-surface-hover text-foreground' : 'text-subtle hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
        title="Spending"
        yearMonth={filters.yearMonth}
        onYearMonthChange={(ym) => update({ yearMonth: ym })}
      />

      <QueryState
        query={query}
        isEmpty={(data) => data.categories.length === 0 && !budgeting}
        errorMessage="Failed to load spending data"
        emptyMessage="No spending data for this month."
      >
        {(data) =>
          budgeting ? (
            <BudgetView spending={data} />
          ) : (
            <>
              <div className="mb-4 flex shrink-0 items-end justify-between px-1">
                <span className="text-sm text-muted">
                  {plural(data.categories.length, 'category', 'categories')}
                  {data.largeTransactions.length > 0 && (
                    <span className="ml-2 text-warning">· {data.largeTransactions.length} large</span>
                  )}
                  <UpdatingIndicator query={query} className="ml-2" />
                </span>
                <span className="text-sm text-subtle">
                  Total{' '}
                  <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                    {money(data.grandTotal)}
                  </span>
                </span>
              </div>

              <div className="min-h-0 space-y-2 overflow-y-auto">
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
          )
        }
      </QueryState>
    </div>
  )
}
