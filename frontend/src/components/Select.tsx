import type { ReactNode } from 'react'

const SELECT_CLASS =
  'h-10 rounded-xl bg-[#f0f0f3] pl-3 pr-8 text-sm text-black border border-[#d7d8de] focus:border-[#0666eb] focus:outline-none appearance-none disabled:cursor-not-allowed disabled:text-[#9a9ba8] disabled:opacity-60'

const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
} as const

export function Select({
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
