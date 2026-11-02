import { useState } from 'react'
import type { ManualTransaction, TransactionType } from '@wealthi/shared'
import { Field, Input } from '../../../components/FormFields'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { Select } from '../../../components/Select'
import { SubmitButton } from '../../../components/TextField'
import { useAccounts } from '../../../hooks/useAccounts'
import { useCategories } from '../../../hooks/useCategories'
import { useSaveManualTransaction } from '../../../hooks/useManualTransactions'
import { today } from '../../../utils/utils'

const DIRECTIONS = [
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
] as const satisfies readonly { value: TransactionType; label: string }[]

/** The form's state: every field as its input holds it, '' for "none". */
interface Draft {
  type: TransactionType
  amount: string
  account: string
  merchant: string
  categoryId: string
  date: string
}

function draftOf(entry: ManualTransaction | null): Draft {
  if (!entry) return { type: 'debit', amount: '', account: '', merchant: '', categoryId: '', date: today() }
  return {
    ...entry,
    amount: String(entry.amount),
    categoryId: entry.categoryId === null ? '' : String(entry.categoryId),
  }
}

/** Adds a manual transaction, or edits `entry`. It reaches the ledger at the next import. */
export function ManualForm({ entry, onDone }: { entry: ManualTransaction | null; onDone: () => void }) {
  const [draft, setDraft] = useState(() => draftOf(entry))
  const { accounts, currency } = useAccounts()
  const categories = useCategories().data?.categories ?? []
  const save = useSaveManualTransaction()

  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((d) => ({ ...d, [key]: value }))

  // Until the accounts load there is nothing to pick; then the first is the default.
  const account = draft.account || (accounts[0]?.id ?? '')
  const amount = Number(draft.amount)
  const ready = draft.merchant.trim() !== '' && amount > 0 && draft.date !== '' && account !== ''

  return (
    <form
      aria-label={entry ? `Edit ${entry.merchant}` : 'New manual transaction'}
      className="w-full space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          {
            id: entry?.id ?? null,
            entry: {
              type: draft.type,
              amount,
              account,
              merchant: draft.merchant.trim(),
              categoryId: draft.categoryId === '' ? null : Number(draft.categoryId),
              date: draft.date,
            },
          },
          { onSuccess: onDone },
        )
      }}
    >
      <SegmentedControl label="Direction" value={draft.type} options={DIRECTIONS} onChange={set('type')} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Merchant">
          <Input
            label="Merchant"
            type="text"
            value={draft.merchant}
            onChange={set('merchant')}
            placeholder="e.g. Bank fee"
            maxLength={100}
            autoFocus
          />
        </Field>
        <Field label={`Amount (${currency(account)})`}>
          <Input
            label="Amount"
            type="number"
            value={draft.amount}
            onChange={set('amount')}
            min="0.01"
            step="0.01"
            placeholder="0.00"
          />
        </Field>
        <Field label="Account">
          <Select label="Account" value={account} onChange={set('account')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select label="Category" value={draft.categoryId} onChange={set('categoryId')}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input label="Date" type="date" value={draft.date} onChange={set('date')} />
        </Field>
      </div>

      {save.error && (
        <p role="alert" className="rounded-2xl bg-negative-soft p-4 text-sm text-negative">
          {save.error.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-full px-4 text-sm font-medium text-subtle transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          Cancel
        </button>
        <SubmitButton disabled={!ready || save.isPending}>{entry ? 'Save' : 'Add transaction'}</SubmitButton>
      </div>
    </form>
  )
}
