import type { ReactNode } from 'react'
import { money } from '../../../utils/utils'

type Accent = 'blue' | 'orange' | 'muted'

const ACCENTS: Record<Accent, { label: string; badge: string; bar: string }> = {
  blue: { label: 'text-black', badge: 'bg-[#0666eb]/10 text-[#0666eb]', bar: 'bg-[#0666eb]' },
  orange: { label: 'text-black', badge: 'bg-[#ff9500]/10 text-[#ff9500]', bar: 'bg-[#ff9500]' },
  muted: { label: 'text-[#9a9ba8]', badge: 'bg-[#dde0e6] text-[#9a9ba8]', bar: 'bg-[#dde0e6]' },
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
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${colors.badge}`}>
            {badge}
          </span>
        </div>
        <span className="shrink-0 font-mono text-sm font-medium text-[#6b6d80]">{money(amount)}</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#dde0e6]">
        <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[#9a9ba8]">{footer}</div>
    </div>
  )
}
