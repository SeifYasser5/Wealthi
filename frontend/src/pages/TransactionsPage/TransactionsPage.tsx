import { LoaderCircle } from 'lucide-react'
import { FilterBar } from './components/FilterBar'
import { PageHeader } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { TransactionsTable } from './components/TransactionsTable'
import { useFilters } from '../../hooks/useFilters'
import { useTransactions } from '../../hooks/useTransactions'
import { plural } from '../../utils/utils'

export function TransactionsPage() {
  const { filters, update } = useFilters()
  const query = useTransactions(filters)
  // A refetch over rows already on screen; the first load is QueryState's job.
  const updating = query.isFetching && !query.isLoading

  return (
    // From md up the page is exactly the viewport under the NavBar (h-16 plus its
    // 1px border), so the table scrolls inside it and the filters never leave view.
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-4 md:flex md:h-[calc(100dvh-4rem-1px)] md:flex-col">
      <PageHeader
        compact
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
          onClear={() => update({ account: '', merchant: '', type: '', transfer: '', counterAccount: '' })}
          // The spinner shares the count's cell instead of taking a slot of its own:
          // the bar has little room to spare, and anything that widens it mid-fetch
          // wraps it onto a second line, dropping the table a row and back.
          summary={
            <div className="grid min-w-4 place-items-center text-sm whitespace-nowrap text-subtle">
              {query.data && (
                <span
                  title={plural(query.data.count, 'transaction')}
                  aria-label={plural(query.data.count, 'transaction')}
                  className={`col-start-1 row-start-1 ${updating ? 'invisible' : ''}`}
                >
                  {query.data.count}
                </span>
              )}
              {updating && (
                <LoaderCircle
                  size={16}
                  role="status"
                  aria-label="Updating"
                  className="col-start-1 row-start-1 animate-spin text-primary"
                />
              )}
            </div>
          }
        />
      </PageHeader>

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
