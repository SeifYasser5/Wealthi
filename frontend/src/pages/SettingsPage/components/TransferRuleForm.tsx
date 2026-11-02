import { useState } from 'react'
import type { TransactionType, TransferRule } from '@wealthi/shared'
import { FormFooter } from '../../../components/FormFooter'
import { Field, Input } from '../../../components/FormFields'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { Select } from '../../../components/Select'
import { useAccounts } from '../../../hooks/useAccounts'
import { useSaveTransferRule } from '../../../hooks/useSettings'

const DIRECTIONS = [
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
] as const satisfies readonly { value: TransactionType; label: string }[]

/** Adds a transfer rule, or edits `rule`. The next import tags the legs it matches. */
export function TransferRuleForm({ rule, onDone }: { rule: TransferRule | null; onDone: () => void }) {
  const { accounts } = useAccounts()
  const [type, setType] = useState<TransactionType>(rule?.type ?? 'debit')
  const [account, setAccount] = useState(rule?.account ?? '')
  const [merchant, setMerchant] = useState(rule?.merchant ?? '')
  const [counterAccount, setCounterAccount] = useState(rule?.counterAccount ?? '')
  const save = useSaveTransferRule()

  // Until the accounts load there is nothing to pick; then the first is the
  // default, and the counter account is the first other one.
  const from = account || (accounts[0]?.id ?? '')
  const to = counterAccount || (accounts.find((a) => a.id !== from)?.id ?? '')
  const ready = from !== '' && to !== '' && from !== to

  return (
    <form
      aria-label={rule ? 'Edit transfer rule' : 'New transfer rule'}
      className="w-full space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ id: rule?.id ?? null, rule: { account: from, type, merchant, counterAccount: to } }, { onSuccess: onDone }) // prettier-ignore
      }}
    >
      <SegmentedControl label="Direction" value={type} options={DIRECTIONS} onChange={setType} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="On account">
          <Select label="Account" value={from} onChange={setAccount}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Transfers to or from">
          <Select label="Other account" value={to} onChange={setCounterAccount}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Merchant, exactly as the bank prints it (empty matches any)" wide>
          <Input
            label="Merchant"
            type="text"
            value={merchant}
            onChange={setMerchant}
            placeholder="Any merchant"
            maxLength={100}
          />
        </Field>
      </div>

      <FormFooter error={save.error} disabled={!ready || save.isPending} onCancel={onDone}>
        {rule ? 'Save' : 'Add rule'}
      </FormFooter>
    </form>
  )
}
