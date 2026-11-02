import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { percentChange, type Summary, type Swatch } from '../../../utils/insights'
import { money } from '../../../utils/utils'
import { Sparkline } from './Sparkline'

interface Props {
  current: Summary
  /** The same span just before, or null when there is none to compare with (all time). */
  previous: Summary | null
  /** "Jun – Oct 2026" — what the tiles cover. */
  period: string
  months: number
}

/** The headline numbers: what came in, what went out, what was kept. */
export function SummaryTiles({ current, previous, period, months }: Props) {
  const currentRate = current.savingsRate
  const previousRate = previous?.savingsRate ?? null

  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Spent"
        value={money(current.spent)}
        note={months > 1 ? `≈ ${money(current.spent / months)} a month` : period}
        delta={previous && percentChange(current.spent, previous.spent)}
        upIsGood={false}
        trend={current.monthly.spent}
        swatch="negative"
      />
      <Tile
        label="Income"
        value={money(current.received)}
        note={months > 1 ? `≈ ${money(current.received / months)} a month` : period}
        delta={previous && percentChange(current.received, previous.received)}
        upIsGood
        trend={current.monthly.received}
        swatch="positive"
      />
      <Tile
        label="Net"
        value={`${current.net > 0 ? '+' : ''}${money(current.net)}`}
        note={current.net >= 0 ? 'kept' : 'more out than in'}
        delta={previous && percentChange(current.net, previous.net)}
        upIsGood
        trend={current.monthly.net}
        swatch="chart-1"
      />
      <Tile
        label="Savings rate"
        value={currentRate === null ? '—' : `${Math.round(currentRate)}%`}
        note="of income kept"
        delta={currentRate === null || previousRate === null ? null : currentRate - previousRate}
        unit=" pts"
        upIsGood
      />
    </section>
  )
}

function Tile({
  label,
  value,
  note,
  delta,
  upIsGood,
  unit = '%',
  trend,
  swatch,
}: {
  label: string
  value: string
  note: string
  /** Change against the previous period; null hides it. */
  delta: number | null
  upIsGood: boolean
  /** "%" for a relative change, "pts" for a change in a percentage. */
  unit?: string
  trend?: number[]
  swatch?: Swatch
}) {
  return (
    <div className="flex flex-col rounded-3xl bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-subtle">{label}</span>
        {delta !== null && <Delta value={delta} upIsGood={upIsGood} unit={unit} />}
      </div>
      <span className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</span>
      <span className="mt-0.5 text-xs text-muted">{note}</span>
      {/* A one-month trend is a dot, not a trend. */}
      {trend && swatch && trend.length > 1 && (
        <div className="mt-auto pt-3">
          <Sparkline values={trend} swatch={swatch} height={36} />
        </div>
      )}
    </div>
  )
}

/** "▲ 12%" against the previous period, green when the move is a good one. */
export function Delta({
  value,
  upIsGood,
  unit = '%',
  title = 'Against the previous period',
}: {
  value: number
  upIsGood: boolean
  unit?: string
  title?: string
}) {
  const rounded = Math.round(value)
  const up = rounded > 0
  const good = rounded === 0 ? null : up === upIsGood
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const tone = good === null ? 'bg-surface-raised text-subtle' : good ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative' // prettier-ignore

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full whitespace-nowrap px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
    >
      {rounded !== 0 && <Icon aria-hidden size={12} strokeWidth={2.5} />}
      {rounded === 0 ? 'flat' : `${Math.abs(rounded)}${unit}`}
    </span>
  )
}
