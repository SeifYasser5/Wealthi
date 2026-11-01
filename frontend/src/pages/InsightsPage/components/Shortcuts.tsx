import {
  Activity,
  ArrowLeftRight,
  CalendarDays,
  ChartPie,
  PiggyBank,
  Store,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { PRESETS, isPreset, type View } from '../../../utils/insights'

const ICONS: Record<(typeof PRESETS)[number]['id'], LucideIcon> = {
  where: ChartPie,
  flow: ArrowLeftRight,
  trends: TrendingUp,
  merchants: Store,
  savings: PiggyBank,
  rhythm: CalendarDays,
  daily: Activity,
  accounts: Wallet,
}

/** One click to the views people ask for most; the one on screen is lit. Filters are kept. */
export function Shortcuts({ view, onPick }: { view: View; onPick: (patch: Partial<View>) => void }) {
  return (
    <div role="group" aria-label="Shortcuts" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {PRESETS.map((preset) => {
        const active = isPreset(view, preset)
        const Icon = ICONS[preset.id]
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(preset.view)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              active
                ? 'bg-primary-soft text-primary'
                : 'bg-surface text-subtle hover:bg-surface-raised hover:text-foreground'
            }`}
          >
            <Icon aria-hidden size={15} />
            {preset.label}
          </button>
        )
      })}
    </div>
  )
}
