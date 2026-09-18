import { FilterBar } from './components/FilterBar'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { UpdatingIndicator } from '../../components/UpdatingIndicator'
import { TransactionsTable } from './components/TransactionsTable'
import { useFilters } from '../../hooks/useFilters'
import { useTransactions } from '../../hooks/useTransactions'
import { plural } from '../../utils/utils'

export function TransactionsPage() {
  const { filters, update } = useFilters()
  const query = useTransactions(filters)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <PageHeader
        title="Transactions"
        yearMonth={filters.yearMonth}
        onYearMonthChange={(ym) => update({ yearMonth: ym })}
      >
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
      </PageHeader>

      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>{query.data ? plural(query.data.count, 'transaction') : ''}</span>
        <UpdatingIndicator query={query} />
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
