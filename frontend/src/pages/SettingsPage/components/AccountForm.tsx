import { useState } from 'react'
import type { Account, Currency } from '@wealthi/shared'
import { FormFooter } from '../../../components/FormFooter'
import { Field, Input } from '../../../components/FormFields'
import { Select } from '../../../components/Select'
import { useCreateAccount, useUpdateAccount } from '../../../hooks/useSettings'
import { CURRENCIES } from '../../../utils/utils'

/**
 * Adds an account, or edits `account`'s label and opening balance. The id and
 * the currency are fixed once it exists: every ledger row holds them.
 */
export function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const [id, setId] = useState('')
  const [label, setLabel] = useState(account?.label ?? '')
  const [currency, setCurrency] = useState<Currency>(CURRENCIES[0])
  const [openingBalance, setOpeningBalance] = useState(account ? String(account.openingBalance) : '0')
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const save = account ? update : create

  const balance = Number(openingBalance)
  const ready =
    label.trim() !== '' &&
    openingBalance.trim() !== '' &&
    Number.isFinite(balance) &&
    (account !== null || id.trim() !== '')

  return (
    <form
      aria-label={account ? `Edit ${account.label}` : 'New account'}
      className="w-full space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (account) {
          update.mutate({ id: account.id, changes: { label: label.trim(), openingBalance: balance } }, { onSuccess: onDone }) // prettier-ignore
        } else {
          create.mutate({ id: id.trim(), label: label.trim(), currency, openingBalance: balance }, { onSuccess: onDone }) // prettier-ignore
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!account && (
          <Field label="Id (what the ledger stores; fixed once saved)">
            <Input
              label="Id"
              type="text"
              value={id}
              onChange={setId}
              placeholder="e.g. checking"
              maxLength={40}
              autoFocus
            />
          </Field>
        )}
        <Field label="Name">
          <Input
            label="Name"
            type="text"
            value={label}
            onChange={setLabel}
            placeholder="e.g. Checking"
            maxLength={60}
            autoFocus={account !== null}
          />
        </Field>
        {!account && (
          <Field label="Currency (fixed once saved)">
            <Select label="Currency" value={currency} onChange={(v) => setCurrency(v as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={`Opening balance (${account?.currency ?? currency})`}>
          <Input
            label="Opening balance"
            type="number"
            value={openingBalance}
            onChange={setOpeningBalance}
            step="0.01"
          />
        </Field>
      </div>

      <FormFooter error={save.error} disabled={!ready || save.isPending} onCancel={onDone}>
        {account ? 'Save' : 'Add account'}
      </FormFooter>
    </form>
  )
}
