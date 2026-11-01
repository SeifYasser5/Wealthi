import type { ReactNode } from 'react'
import { money } from '../../../utils/utils'

type Accent = 'primary' | 'warning' | 'muted'

const ACCENTS: Record<Accent, { label: string; badge: string; bar: string }> = {
  primary: { label: 'text-foreground', badge: 'bg-primary-soft text-primary', bar: 'bg-primary' },
  warning: { label: 'text-foreground', badge: 'bg-warning-soft text-warning', bar: 'bg-warning' },
  muted: { label: 'text-muted', badge: 'bg-surface-hover text-muted', bar: 'bg-muted' },
}

/** Shared body of a spending card: label + badge + amount, share-of-total bar, footer line.
 *  Presentational only — the card around it owns interaction (expanding, category select). */
export function SpendingBar({
  label,
  badge,
  amount,
  pct,
  accent,
  footer,
}: {
  label: string
  badge: ReactNode
  amount: number
  pct: number
  accent: Accent
  footer: ReactNode
}) {
  const colors = ACCENTS[accent]

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-semibold ${colors.label}`}>{label}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${colors.badge}`}>
            {badge}
          </span>
        </div>
        <span className="shrink-0 text-base font-medium tabular-nums text-foreground">{money(amount)}</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">{footer}</div>
    </div>
  )
}
