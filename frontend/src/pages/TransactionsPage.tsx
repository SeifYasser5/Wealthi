import { FilterBar } from '../components/FilterBar'
import { MonthNavigator } from '../components/MonthNavigator'
import { TransactionsTable } from '../components/TransactionsTable'
import { useFilters } from '../hooks/useFilters'
import { useTransactions } from '../hooks/useTransactions'

export function TransactionsPage() {
  const { filters, update } = useFilters()
  const { data, isLoading, isError, error, isFetching } = useTransactions(filters)

  const transactions = data?.transactions ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold uppercase text-black">Transactions</h1>
          <MonthNavigator yearMonth={filters.yearMonth} onChange={(ym) => update({ yearMonth: ym })} />
        </div>
        <FilterBar
          account={filters.account}
          merchant={filters.merchant}
          onAccountChange={(account) => update({ account })}
          onMerchantChange={(merchant) => update({ merchant })}
        />
      </header>

      <div className="mb-3 flex items-center justify-between text-sm text-[#9a9ba8]">
        <span>{data ? `${data.count} transaction${data.count === 1 ? '' : 's'}` : ''}</span>
        {isFetching && !isLoading && <span className="text-[#0666eb]">Updating…</span>}
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-[#f0f0f3] py-16 text-center text-[#9a9ba8]">Loading…</div>
      ) : isError ? (
        <div className="rounded-2xl bg-[#ff3b30]/10 py-16 text-center text-[#ff3b30]">
          {error instanceof Error ? error.message : 'Failed to load transactions'}
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-2xl bg-[#f0f0f3] py-16 text-center text-[#9a9ba8]">
          No transactions match these filters.
        </div>
      ) : (
        <TransactionsTable transactions={transactions} />
      )}
    </div>
  )
}
