import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActionButton } from '../../../components/ActionButton'
import { MonthNavigator } from '../../../components/MonthNavigator'
import { QueryState } from '../../../components/QueryState'
import { useFilters } from '../../../hooks/useFilters'
import { useManualTransactions } from '../../../hooks/useManualTransactions'
import { ManualForm } from './ManualForm'
import { ManualItem } from './ManualItem'

/** The one-off transactions of a month; the month lives in the URL like on Transactions. */
export function ManualSection() {
  const { filters, update } = useFilters()
  const manual = useManualTransactions(filters.yearMonth)
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-sm text-subtle">
          One-off transactions that never come in a bank message, like a fee or an adjustment. They are kept here, so
          every import copies them into the ledger again; a new or edited one shows on the ledger after the next import.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <MonthNavigator yearMonth={filters.yearMonth} onChange={(ym) => update({ yearMonth: ym })} />
          {!adding && (
            <ActionButton onClick={() => setAdding(true)} icon={Plus} busy={false}>
              New transaction
            </ActionButton>
          )}
        </div>
      </div>
      {adding && (
        <section className="shrink-0 rounded-3xl bg-surface p-6">
          <ManualForm entry={null} onDone={() => setAdding(false)} />
        </section>
      )}
      <QueryState
        query={manual}
        isEmpty={(data) => data.manualTransactions.length === 0}
        errorMessage="Could not load manual transactions."
        emptyMessage="No manual transactions this month."
      >
        {(data) => (
          <ul
            aria-label="Your manual transactions"
            className="min-h-0 divide-y divide-line overflow-y-auto rounded-3xl bg-surface"
          >
            {data.manualTransactions.map((entry) => (
              <ManualItem key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  )
}
