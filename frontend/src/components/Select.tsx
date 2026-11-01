import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * A native select drawn as a pill chip. It lights up in the primary tint while
 * it holds a value, so a narrowed filter is visible at a glance; '' is "any".
 */
export function Select({
  value,
  onChange,
  disabled,
  title,
  label,
  children,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  title?: string
  /** Accessible name, for a select whose first option alone doesn't say what it filters. */
  label?: string
  children: ReactNode
}) {
  const active = value !== '' && !disabled

  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={title}
        aria-label={label}
        className={`h-9 appearance-none rounded-full pl-4 pr-9 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:text-muted ${
          active ? 'bg-primary-soft text-primary' : 'bg-surface-raised text-foreground hover:bg-surface-hover'
        }`}
      >
        {children}
      </select>
      {/* The native arrow is hidden by appearance-none; this one follows the theme. */}
      <ChevronDown
        size={15}
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${active ? 'text-primary' : 'text-muted'}`}
      />
    </span>
  )
}
