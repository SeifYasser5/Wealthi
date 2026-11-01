import type { ReactNode } from 'react'

/** A one-line text input drawn as a pill, the same as the merchant search. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength,
}: {
  /** Accessible name; there is no visible label. */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  maxLength?: number
}) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      className="h-9 min-w-0 flex-1 rounded-full bg-surface-raised px-4 text-sm text-foreground placeholder-muted transition-colors focus:bg-surface-hover focus:outline-2 focus:outline-primary"
    />
  )
}

/** The submit button beside a TextField. */
export function SubmitButton({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-primary-soft disabled:text-primary"
    >
      {children}
    </button>
  )
}
