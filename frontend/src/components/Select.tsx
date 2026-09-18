import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

const SELECT_CLASS =
  'h-10 appearance-none rounded-xl border border-line bg-surface pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:text-muted'

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
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={title}
        className={SELECT_CLASS}
      >
        {children}
      </select>
      {/* The native arrow is hidden by appearance-none; this one follows the theme. */}
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  )
}
