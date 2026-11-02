import { useState } from 'react'
import type { Frequency, Schedule, ScheduleRequest, TransactionType } from '@wealthi/shared'
import { Field, Input } from '../../../components/FormFields'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { Select } from '../../../components/Select'
import { SubmitButton } from '../../../components/TextField'
import { useAccounts } from '../../../hooks/useAccounts'
import { useCategories } from '../../../hooks/useCategories'
import { useSaveSchedule } from '../../../hooks/useSchedules'
import { frequencyUnit, today } from '../../../utils/utils'

const DIRECTIONS = [
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
] as const satisfies readonly { value: TransactionType; label: string }[]

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly']

/** The form's state: every field as its input holds it, '' for "none". */
interface Draft {
  type: TransactionType
  amount: string
  account: string
  merchant: string
  categoryId: string
  frequency: Frequency
  interval: string
  startDate: string
  endDate: string
}

/** What a suggestion fills in; the rest of the form keeps its defaults. */
export type ScheduleSeed = Pick<ScheduleRequest, 'merchant' | 'type' | 'amount' | 'account' | 'startDate'>

function draftOf(schedule: Schedule | null, seed?: ScheduleSeed): Draft {
  if (!schedule) {
    const blank: Draft = {
      type: 'debit',
      amount: '',
      account: '',
      merchant: '',
      categoryId: '',
      frequency: 'monthly',
      interval: '1',
      startDate: today(),
      endDate: '',
    }
    return seed ? { ...blank, ...seed, amount: String(seed.amount) } : blank
  }
  return {
    ...schedule,
    amount: String(schedule.amount),
    categoryId: schedule.categoryId === null ? '' : String(schedule.categoryId),
    interval: String(schedule.interval),
    endDate: schedule.endDate ?? '',
  }
}

/**
 * Adds a schedule (starting from `initial`'s fields, if given), or edits
 * `schedule`. Its occurrences reach the ledger at the next import; an edit
 * rewrites every one of them, past ones included.
 */
export function ScheduleForm({
  schedule,
  initial,
  onDone,
}: {
  schedule: Schedule | null
  initial?: ScheduleSeed
  onDone: () => void
}) {
  const [draft, setDraft] = useState(() => draftOf(schedule, initial))
  const { accounts, currency } = useAccounts()
  const categories = useCategories().data?.categories ?? []
  const save = useSaveSchedule()

  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((d) => ({ ...d, [key]: value }))

  // Until the accounts load there is nothing to pick; then the first is the default.
  const account = draft.account || (accounts[0]?.id ?? '')
  const amount = Number(draft.amount)
  const interval = Number(draft.interval)
  const ready =
    draft.merchant.trim() !== '' &&
    amount > 0 &&
    Number.isInteger(interval) &&
    interval >= 1 &&
    draft.startDate !== '' &&
    account !== ''

  return (
    <form
      aria-label={schedule ? `Edit ${schedule.merchant}` : 'New schedule'}
      className="w-full space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          {
            id: schedule?.id ?? null,
            schedule: {
              type: draft.type,
              amount,
              account,
              merchant: draft.merchant.trim(),
              categoryId: draft.categoryId === '' ? null : Number(draft.categoryId),
              frequency: draft.frequency,
              interval,
              startDate: draft.startDate,
              endDate: draft.endDate || null,
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
            placeholder="e.g. RENT"
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
        <Field label="Repeats every" wide>
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Input
                label="Interval"
                type="number"
                value={draft.interval}
                onChange={set('interval')}
                min="1"
                max="999"
                step="1"
              />
            </div>
            <Select label="Frequency" value={draft.frequency} onChange={(v) => set('frequency')(v as Frequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {frequencyUnit(f, interval)}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label="Starts">
          <Input label="Start date" type="date" value={draft.startDate} onChange={set('startDate')} />
        </Field>
        <Field label="Ends (leave empty to repeat indefinitely)">
          <Input label="End date" type="date" value={draft.endDate} onChange={set('endDate')} min={draft.startDate} />
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
        <SubmitButton disabled={!ready || save.isPending}>{schedule ? 'Save' : 'Add schedule'}</SubmitButton>
      </div>
    </form>
  )
}
