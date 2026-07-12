import { useState } from 'react'
import { MonthNavigator } from '../components/MonthNavigator'
import { useFilters } from '../hooks/useFilters'
import { useSpending } from '../hooks/useSpending'
import type { CategoryRow, LargeTransactionRow } from '../lib/api'

function fmt(amount: number) {
  return Math.round(amount).toLocaleString()
}

function CategoryCard({ row, grandTotal }: { row: CategoryRow; grandTotal: number }) {
  const [open, setOpen] = useState(false)
  const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0
  const isUncategorized = row.category === 'Uncategorized'

  return (
    <div className="overflow-hidden rounded-2xl bg-[#f4f5f7]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#e9eaed]"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`font-semibold ${isUncategorized ? 'text-[#9a9ba8]' : 'text-black'}`}>
                {row.category}
              </span>
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                  isUncategorized ? 'bg-[#dde0e6] text-[#9a9ba8]' : 'bg-[#0666eb]/10 text-[#0666eb]'
                }`}
              >
                {pct.toFixed(1)}%
              </span>
            </div>
            <span className="shrink-0 font-mono text-sm font-medium text-[#6b6d80]">{fmt(row.total)}</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#dde0e6]">
            <div
              className={`h-full rounded-full transition-all ${isUncategorized ? 'bg-[#dde0e6]' : 'bg-[#0666eb]'}`}
              style={{ width: `${pct.toFixed(1)}%` }}
            />
          </div>
          <span className="mt-1 text-xs text-[#9a9ba8]">
            {row.merchants.length} merchant{row.merchants.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-[#9a9ba8] text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[#dde0e6] px-5 pb-4 pt-2">
          <table className="w-full text-sm">
            <tbody>
              {row.merchants.map((m) => (
                <tr key={m.merchant} className="border-b border-[#dde0e6] last:border-0">
                  <td className="py-1.5 text-[#6b6d80]">{m.merchant}</td>
                  <td className="py-1.5 text-right font-mono text-black">{fmt(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LargeTransactionCard({ tx }: { tx: LargeTransactionRow }) {
  const label = tx.merchant ?? tx.account

  return (
    <div className="overflow-hidden rounded-2xl bg-[#f4f5f7]">
      <div className="flex w-full items-center gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black">{label}</span>
              <span className="rounded-md bg-[#ff9500]/10 px-1.5 py-0.5 text-xs font-bold text-[#ff9500]">large</span>
            </div>
            <span className="shrink-0 font-mono text-sm font-medium text-[#6b6d80]">{fmt(tx.amount)}</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#dde0e6]">
            <div className="h-full rounded-full bg-[#ff9500] transition-all" style={{ width: `${tx.pct.toFixed(1)}%` }} />
          </div>
          <span className="mt-1 text-xs text-[#9a9ba8]">{tx.pct.toFixed(1)}% of total · single transaction</span>
        </div>
      </div>
    </div>
  )
}

export function SpendingPage() {
  const { filters, update } = useFilters()
  const { data, isLoading, isError, error, isFetching } = useSpending(filters.yearMonth)

  const items = data
    ? [
        ...data.categories.map((row) => ({ kind: 'category' as const, row, sortKey: row.total })),
        ...data.largeTransactions.map((tx) => ({ kind: 'large-tx' as const, tx, sortKey: tx.amount })),
      ].sort((a, b) => b.sortKey - a.sortKey)
    : []

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-black">Spending</h1>
        <MonthNavigator yearMonth={filters.yearMonth} onChange={(ym) => update({ yearMonth: ym })} />
      </header>

      {isLoading ? (
        <div className="rounded-2xl bg-[#f4f5f7] py-16 text-center text-[#9a9ba8]">Loading…</div>
      ) : isError ? (
        <div className="rounded-2xl bg-[#ff3b30]/10 py-16 text-center text-[#ff3b30]">
          {error instanceof Error ? error.message : 'Failed to load spending data'}
        </div>
      ) : !data || data.categories.length === 0 ? (
        <div className="rounded-2xl bg-[#f4f5f7] py-16 text-center text-[#9a9ba8]">
          No spending data for this month.
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm text-[#9a9ba8]">
              {data.categories.length} categor{data.categories.length !== 1 ? 'ies' : 'y'}
              {data.largeTransactions.length > 0 && (
                <span className="ml-2 text-[#ff9500]">· {data.largeTransactions.length} large</span>
              )}
              {isFetching && <span className="ml-2 text-[#0666eb]">Updating…</span>}
            </span>
            <span className="font-semibold text-black">
              Total <span className="font-mono">{fmt(data.grandTotal)}</span>
            </span>
          </div>

          <div className="space-y-2">
            {items.map((item) =>
              item.kind === 'category' ? (
                <CategoryCard key={`cat-${item.row.category}`} row={item.row} grandTotal={data.grandTotal} />
              ) : (
                <LargeTransactionCard key={`tx-${item.tx.id}`} tx={item.tx} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  )
}
