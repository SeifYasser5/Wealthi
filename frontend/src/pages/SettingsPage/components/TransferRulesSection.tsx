import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActionButton } from '../../../components/ActionButton'
import { QueryState } from '../../../components/QueryState'
import { useTransferRules } from '../../../hooks/useSettings'
import { TransferRuleForm } from './TransferRuleForm'
import { TransferRuleItem } from './TransferRuleItem'

/** The rules that tag a debit or credit as a transfer between two of your accounts. */
export function TransferRulesSection() {
  const rules = useTransferRules()
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-sm text-subtle">
          A transfer is a tag on an ordinary debit or credit, never a guess from amounts and dates. A rule matches the
          account, the direction and the merchant exactly as the bank prints it, and names the account on the other
          side. One with a merchant is tried before one for any merchant. Rules apply at the next import.
        </p>
        {!adding && (
          <ActionButton onClick={() => setAdding(true)} icon={Plus} busy={false}>
            New rule
          </ActionButton>
        )}
      </div>
      {adding && (
        <section className="shrink-0 rounded-3xl bg-surface p-6">
          <TransferRuleForm rule={null} onDone={() => setAdding(false)} />
        </section>
      )}
      <QueryState
        query={rules}
        isEmpty={(data) => data.transferRules.length === 0}
        errorMessage="Could not load transfer rules."
        emptyMessage="No transfer rules yet. Without one, a payment between your accounts is an ordinary debit and credit."
      >
        {(data) => (
          <ul
            aria-label="Your transfer rules"
            className="min-h-0 divide-y divide-line overflow-y-auto rounded-3xl bg-surface"
          >
            {data.transferRules.map((rule) => (
              <TransferRuleItem key={rule.id} rule={rule} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  )
}
