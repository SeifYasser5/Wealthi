import { FilterBar } from '../components/FilterBar'
import { MonthNavigator } from '../components/MonthNavigator'
import { QueryState } from '../components/QueryState'
import { TransactionsTable } from '../components/TransactionsTable'
import { useFilters } from '../hooks/useFilters'
import { useTransactions } from '../hooks/useTransactions'

export function TransactionsPage() {
  const { filters, update } = useFilters()
  const query = useTransactions(filters)

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
          type={filters.type}
          transfer={filters.transfer}
          counterAccount={filters.counterAccount}
          onAccountChange={(account) => update({ account })}
          onMerchantChange={(merchant) => update({ merchant })}
          onTypeChange={(type) => update({ type })}
          // Excluding transfers drops any counter account along with it; the two
          // together describe an empty result set.
          onTransferChange={(transfer) =>
            update(transfer === 'exclude' ? { transfer, counterAccount: '' } : { transfer })
          }
          // Naming a counter account is a transfers-only query, so the transfer
          // select is moved to match rather than left showing a wider filter.
          onCounterAccountChange={(counterAccount) =>
            update(counterAccount ? { counterAccount, transfer: 'only' } : { counterAccount })
          }
        />
      </header>

      <div className="mb-3 flex items-center justify-between text-sm text-[#9a9ba8]">
        <span>{query.data ? `${query.data.count} transaction${query.data.count === 1 ? '' : 's'}` : ''}</span>
        {query.isFetching && !query.isLoading && <span className="text-[#0666eb]">Updating…</span>}
      </div>

      <QueryState
        query={query}
        isEmpty={(data) => data.transactions.length === 0}
        errorMessage="Failed to load transactions"
        emptyMessage="No transactions match these filters."
      >
        {(data) => <TransactionsTable transactions={data.transactions} />}
      </QueryState>
    </div>
  )
}
