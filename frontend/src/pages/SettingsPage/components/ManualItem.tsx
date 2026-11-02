import { useState } from 'react'
import { HandCoins, Pencil, Trash2 } from 'lucide-react'
import type { ManualTransaction } from '@wealthi/shared'
import { IconButton } from '../../../components/IconButton'
import { useAccounts } from '../../../hooks/useAccounts'
import { useDeleteManualTransaction } from '../../../hooks/useManualTransactions'
import { formatCalendarDay, money } from '../../../utils/utils'
import { ManualForm } from './ManualForm'

/** One manual transaction: what, how much and when, editable in place. Deleting asks first. */
export function ManualItem({ entry }: { entry: ManualTransaction }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteManualTransaction()
  const { label: accountLabel } = useAccounts()
  const { merchant, type, amount, currency, category, date } = entry

  if (editing) {
    return (
      <li aria-label={merchant} className="p-5">
        <ManualForm entry={entry} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li aria-label={merchant} className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            type === 'credit' ? 'bg-positive-soft text-positive' : 'bg-surface-hover text-subtle'
          }`}
        >
          <HandCoins size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{merchant}</h3>
          <p className="mt-0.5 text-sm text-subtle">
            {[formatCalendarDay(date), accountLabel(entry.account), category].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p
          className={`font-semibold whitespace-nowrap tabular-nums ${type === 'credit' ? 'text-positive' : 'text-negative'}`}
        >
          {type === 'credit' ? '+' : '−'}
          {money(amount)} {currency}
        </p>
        <div className="flex items-center gap-1">
          <IconButton icon={Pencil} label={`Edit ${merchant}`} onClick={() => setEditing(true)} />
          <IconButton
            icon={Trash2}
            tone="danger"
            label={`Delete ${merchant}`}
            disabled={confirming}
            onClick={() => setConfirming(true)}
          />
        </div>
      </div>

      {confirming && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-negative-soft p-4">
          <p className="min-w-0 flex-1 text-sm text-negative">
            Delete {merchant}? The next import removes it from the ledger.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-9 rounded-full px-4 text-sm font-medium text-subtle transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => remove.mutate(entry.id)}
            disabled={remove.isPending}
            className="h-9 rounded-full bg-negative px-4 text-sm font-semibold text-on-primary transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-negative disabled:cursor-wait"
          >
            Delete
          </button>
          {remove.error && (
            <p role="alert" className="w-full text-xs text-negative">
              {remove.error.message}
            </p>
          )}
        </div>
      )}
    </li>
  )
}
