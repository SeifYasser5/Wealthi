import { useEffect, useRef, useState } from 'react'
import { ACCOUNTS, type AccountId } from '../lib/accounts'

interface Props {
  account: AccountId | ''
  merchant: string
  onAccountChange: (account: AccountId | '') => void
  onMerchantChange: (merchant: string) => void
}

export function FilterBar({ account, merchant, onAccountChange, onMerchantChange }: Props) {
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

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <select
        value={account}
        onChange={(e) => onAccountChange(e.target.value as AccountId | '')}
        className="h-10 rounded-xl bg-[#f0f0f3] pl-3 pr-8 text-sm text-black border border-[#d7d8de] focus:border-[#0666eb] focus:outline-none appearance-none"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
      >
        <option value="">All accounts</option>
        {ACCOUNTS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>

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
