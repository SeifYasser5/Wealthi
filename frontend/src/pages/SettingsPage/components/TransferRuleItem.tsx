import { useState } from 'react'
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react'
import type { TransferRule } from '@wealthi/shared'
import { ConfirmDelete } from '../../../components/ConfirmDelete'
import { IconButton } from '../../../components/IconButton'
import { useAccounts } from '../../../hooks/useAccounts'
import { useDeleteTransferRule } from '../../../hooks/useSettings'
import { TransferRuleForm } from './TransferRuleForm'

/** One transfer rule, editable in place. Deleting asks first. */
export function TransferRuleItem({ rule }: { rule: TransferRule }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteTransferRule()
  const { label } = useAccounts()
  const { id, type, account, merchant, counterAccount } = rule

  const name = `${merchant === '' ? 'Any merchant' : merchant} on ${label(account)}`
  const direction = type === 'debit' ? 'Money out of' : 'Money in to'

  if (editing) {
    return (
      <li aria-label={name} className="p-5">
        <TransferRuleForm rule={rule} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li aria-label={name} className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-hover text-subtle">
          <ArrowLeftRight size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{name}</h3>
          <p className="mt-0.5 text-sm text-subtle">
            {direction} {label(account)} · {type === 'debit' ? 'to' : 'from'} {label(counterAccount)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton icon={Pencil} label={`Edit ${name}`} onClick={() => setEditing(true)} />
          <IconButton
            icon={Trash2}
            tone="danger"
            label={`Delete ${name}`}
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
          Delete this rule? Transfers it tagged lose the tag at the next import.
        </ConfirmDelete>
      )}
    </li>
  )
}
