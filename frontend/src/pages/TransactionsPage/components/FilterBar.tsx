import { useEffect, useRef, useState } from 'react'
import { useAccounts } from '../../../hooks/useAccounts'
import { Select } from '../../../components/Select'
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
}

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

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Select value={account} onChange={(v) => onAccountChange(v as AccountId | '')}>
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </Select>

      <Select value={type} onChange={(v) => onTypeChange(v as TransactionType | '')}>
        <option value="">Debits &amp; credits</option>
        <option value="debit">Debits only</option>
        <option value="credit">Credits only</option>
      </Select>

      <Select value={transfer} onChange={(v) => onTransferChange(v as TransferFilter | '')}>
        <option value="">Transfers &amp; spending</option>
        <option value="only">Transfers only</option>
        <option value="exclude">Exclude transfers</option>
      </Select>

      <Select
        value={counterAccount}
        onChange={(v) => onCounterAccountChange(v as AccountId | '')}
        disabled={counterDisabled}
        title={counterDisabled ? 'Not available while transfers are excluded' : undefined}
      >
        <option value="">Any counter account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            ↔ {a.label}
          </option>
        ))}
      </Select>

      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search merchant…"
        className="h-10 w-64 rounded-xl bg-surface px-3 text-sm text-foreground border border-line placeholder-muted focus:border-primary focus:outline-none"
      />
    </div>
  )
}
