import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActionButton } from '../../../components/ActionButton'
import { QueryState } from '../../../components/QueryState'
import { useAccounts } from '../../../hooks/useAccounts'
import { AccountForm } from './AccountForm'
import { AccountItem } from './AccountItem'

/** The accounts and the balance each opens with. */
export function AccountsSection() {
  const { accounts, query } = useAccounts()
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-sm text-subtle">
          Your own accounts. The opening balance is what the account held at the start of the import&apos;s rolling
          window (the earliest month the import computes); it reaches the balances at the next import.
        </p>
        {!adding && (
          <ActionButton onClick={() => setAdding(true)} icon={Plus} busy={false}>
            New account
          </ActionButton>
        )}
      </div>
      {adding && (
        <section className="shrink-0 rounded-3xl bg-surface p-6">
          <AccountForm account={null} onDone={() => setAdding(false)} />
        </section>
      )}
      <QueryState
        query={query}
        isEmpty={() => accounts.length === 0}
        errorMessage="Could not load accounts."
        emptyMessage="No accounts yet. Add one, then map the source keys of your cards and accounts to it."
      >
        {() => (
          <ul
            aria-label="Your accounts"
            className="min-h-0 divide-y divide-line overflow-y-auto rounded-3xl bg-surface"
          >
            {accounts.map((account) => (
              <AccountItem key={account.id} account={account} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  )
}
