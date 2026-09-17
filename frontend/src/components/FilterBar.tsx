import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccounts } from '../hooks/useAccounts'
import type { AccountId } from '../lib/accounts'
import type { TransactionType, TransferFilter } from '../lib/api'

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

const SELECT_CLASS =
  'h-10 rounded-xl bg-[#f0f0f3] pl-3 pr-8 text-sm text-black border border-[#d7d8de] focus:border-[#0666eb] focus:outline-none appearance-none disabled:cursor-not-allowed disabled:text-[#9a9ba8] disabled:opacity-60'

const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
} as const

function Select({
  value,
  onChange,
  disabled,
  title,
  children,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title={title}
      className={SELECT_CLASS}
      style={SELECT_STYLE}
    >
      {children}
    </select>
  )
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
  const onMerchantChangeRef = useRef(onMerchantChange)
  onMerchantChangeRef.current = onMerchantChange

  useEffect(() => {
    setText(merchant)
  }, [merchant])

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
        className="h-10 w-64 rounded-xl bg-[#f0f0f3] px-3 text-sm text-black border border-[#d7d8de] placeholder-[#9a9ba8] focus:border-[#0666eb] focus:outline-none"
      />
    </div>
  )
}
