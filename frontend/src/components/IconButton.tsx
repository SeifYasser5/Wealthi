import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  /** Accessible name, and the tooltip unless `title` says more. */
  label: string
  title?: string
  onClick: () => void
  disabled?: boolean
  /** `danger` tints the hover red, for a destructive action. */
  tone?: 'default' | 'danger'
}

/** A round, icon-only button for row actions. */
export function IconButton({ icon: Icon, label, title, onClick, disabled, tone = 'default' }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-8 place-items-center rounded-full text-subtle transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-transparent disabled:text-line ${
        tone === 'danger'
          ? 'hover:bg-negative-soft hover:text-negative'
          : 'hover:bg-surface-hover hover:text-foreground'
      }`}
    >
      <Icon size={16} aria-hidden />
    </button>
  )
}
