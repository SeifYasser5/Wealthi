import type { ReactNode } from 'react'

/** A field with its visible caption above it. */
export function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block px-1 text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  )
}

/** A pill input like TextField, for the number and date fields it doesn't take. */
export function Input({
  label,
  type,
  value,
  onChange,
  ...rest
}: {
  label: string
  type: 'text' | 'number' | 'date'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  step?: string
  maxLength?: number
  autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
      className="h-9 w-full min-w-0 rounded-full bg-surface-raised px-4 text-sm text-foreground scheme-dark placeholder-muted transition-colors focus:bg-surface-hover focus:outline-2 focus:outline-primary"
    />
  )
}
