import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { useAccounts } from '../../../hooks/useAccounts'
import { Select } from '../../../components/Select'
import { SegmentedControl } from '../../../components/SegmentedControl'
import type { AccountId, TransactionType, TransferFilter } from '@wealthi/shared'

interface Props {
  account: AccountId | ''
  merchant: string
  type: TransactionType | ''
  transfer: TransferFilter | ''
  counterAccount: AccountId | ''
  onAccountChange: (account: AccountId | '') => void
  onMerchantChange: (merchant: string) => void
  onTypeChange: (type: TransactionType | '') => void
  onTransferChange: (transfer: TransferFilter | '') => void
  onCounterAccountChange: (counterAccount: AccountId | '') => void
  /** Drops every filter but the month. */
  onClear: () => void
  /** Shown at the end of the bar, e.g. the result count. */
  summary?: ReactNode
}

const TYPES = [
  { value: '', label: 'All' },
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
] as const

const TRANSFERS = [
  { value: '', label: 'All' },
  { value: 'only', label: 'Transfers' },
  { value: 'exclude', label: 'No transfers' },
] as const

export function FilterBar({
  account,
  merchant,
  type,
  transfer,
  counterAccount,
  onAccountChange,
  onMerchantChange,
  onTypeChange,
  onTransferChange,
  onCounterAccountChange,
  onClear,
  summary,
}: Props) {
  const { accounts } = useAccounts()
  const [text, setText] = useState(merchant)
  const [prevMerchant, setPrevMerchant] = useState(merchant)
  if (merchant !== prevMerchant) {
    setPrevMerchant(merchant)
    setText(merchant)
  }

  const onMerchantChangeRef = useRef(onMerchantChange)
  useEffect(() => {
    onMerchantChangeRef.current = onMerchantChange
  })

  useEffect(() => {
    if (text === merchant) return
    const id = setTimeout(() => onMerchantChangeRef.current(text), 300)
    return () => clearTimeout(id)
  }, [text, merchant])

  // Excluding transfers leaves no counter account to pick, so the select is
  // locked rather than allowed to build a query that can't match anything.
  const counterDisabled = transfer === 'exclude'
  const filtered = Boolean(account || merchant || text || type || transfer || counterAccount)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-surface p-3">
      <label className="relative flex w-52 items-center">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 text-muted" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search merchant…"
          className="h-9 w-full rounded-full bg-surface-raised pr-4 pl-10 text-sm text-foreground placeholder-muted transition-colors focus:bg-surface-hover focus:outline-2 focus:outline-primary"
        />
      </label>

      <Select value={account} onChange={(v) => onAccountChange(v as AccountId | '')} label="Account">
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </Select>

      <Select
        value={counterAccount}
        onChange={(v) => onCounterAccountChange(v as AccountId | '')}
        disabled={counterDisabled}
        title={counterDisabled ? 'Not available while transfers are excluded' : undefined}
        label="Counter account"
      >
        <option value="">Any counter account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            ↔ {a.label}
          </option>
        ))}
      </Select>

      <SegmentedControl label="Direction" value={type} options={TYPES} onChange={onTypeChange} />
      <SegmentedControl label="Transfers" value={transfer} options={TRANSFERS} onChange={onTransferChange} />
      <div className="ml-auto flex items-center gap-3 pl-2">
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setText('')
              onClear()
            }}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X size={14} aria-hidden />
            Clear
          </button>
        )}
        {summary}
      </div>
    </div>
  )
}
