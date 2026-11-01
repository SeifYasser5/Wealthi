import type { ChartSeries, Measure, Swatch } from '../../../utils/insights'
import { SWATCH_BG, formatMeasure } from '../../../utils/insights'

/** The row a chart draws: a point's labels and swatch beside one value per series key. */
export interface Datum {
  key: string
  label: string
  title: string
  swatch: Swatch
  drill: boolean
  [series: string]: string | number | boolean
}

interface Props {
  /** Recharts passes these two while the pointer is over the chart. */
  active?: boolean
  payload?: readonly { dataKey?: unknown; value?: unknown; payload?: unknown }[]
  measure: Measure
  series: readonly ChartSeries[]
  /** A slice of a pie: keyed by its own color, with its share of `total`. */
  total?: number
}

/**
 * The hover readout every chart shares: the point's long label, then every
 * series at it, value first and series name second, each keyed by a short
 * stroke of its color. Stacked series also get their total; cash flow its net.
 */
export function ChartTooltip({ active, payload, measure, series, total }: Props) {
  if (!active || !payload?.length) return null
  const datum = payload[0].payload as Datum
  const rows = series.map((s) => ({ ...s, value: Number(datum[s.key]) }))
  const sum = rows.reduce((a, r) => a + r.value, 0)

  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface-raised px-3 py-2.5 shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-subtle">{datum.title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`h-0.5 w-3 shrink-0 rounded-full ${SWATCH_BG[total === undefined ? r.swatch : datum.swatch]}`}
            />
            <span className="font-semibold tabular-nums text-foreground">{formatMeasure(measure, r.value)}</span>
            <span className="truncate text-subtle">
              {total === undefined ? r.label : `${share(r.value, total)} of total`}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 1 && measure !== 'average' && (
        <p className="mt-1.5 flex justify-between gap-4 border-t border-line pt-1.5 text-xs text-subtle">
          <span>{measure === 'flow' ? 'Net' : 'Total'}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatMeasure(measure, measure === 'flow' ? rows[0].value - rows[1].value : sum)}
          </span>
        </p>
      )}
    </div>
  )
}

/** "42%", or "<1%" for a sliver that would otherwise read as nothing. */
export function share(value: number, total: number): string {
  if (total <= 0) return '0%'
  const pct = (value / total) * 100
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`
}
