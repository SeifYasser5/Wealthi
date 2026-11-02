import { useState } from 'react'
import { Landmark, Pencil, Trash2 } from 'lucide-react'
import type { Account } from '@wealthi/shared'
import { ConfirmDelete } from '../../../components/ConfirmDelete'
import { IconButton } from '../../../components/IconButton'
import { useDeleteAccount } from '../../../hooks/useSettings'
import { money } from '../../../utils/utils'
import { AccountForm } from './AccountForm'

/** One account: its name, id and opening balance, editable in place. Deleting asks first. */
export function AccountItem({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteAccount()
  const { id, label, currency, openingBalance } = account

  if (editing) {
    return (
      <li aria-label={label} className="p-5">
        <AccountForm account={account} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li aria-label={label} className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-hover text-subtle">
          <Landmark size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{label}</h3>
          <p className="mt-0.5 text-sm text-subtle">
            {id} · {currency}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xs text-muted">Opening balance</span>
          <span className="font-semibold whitespace-nowrap tabular-nums text-foreground">
            {money(openingBalance)} {currency}
          </span>
        </p>
        <div className="flex items-center gap-1">
          <IconButton icon={Pencil} label={`Edit ${label}`} onClick={() => setEditing(true)} />
          <IconButton
            icon={Trash2}
            tone="danger"
            label={`Delete ${label}`}
            disabled={confirming}
            onClick={() => setConfirming(true)}
          />
        </div>
      </div>

      {confirming && (
        <ConfirmDelete
          pending={remove.isPending}
          error={remove.error}
          onKeep={() => setConfirming(false)}
          onConfirm={() => remove.mutate(id)}
        >
          Delete {label}? Only an account with no transactions, balances, sources or rules can go.
        </ConfirmDelete>
      )}
    </li>
  )
}
