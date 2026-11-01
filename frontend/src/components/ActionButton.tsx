import { LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  onClick: () => void
  icon: LucideIcon
  /** A run is in progress: the button is disabled and its icon becomes a spinner. */
  busy: boolean
  children: ReactNode
}

/** The primary button that starts a long-running action (an import, a learn run, a review). */
export function ActionButton({ onClick, icon: Icon, busy, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:bg-primary-soft disabled:text-primary"
    >
      {busy ? <LoaderCircle size={17} aria-hidden className="animate-spin" /> : <Icon size={17} aria-hidden />}
      {children}
    </button>
  )
}
