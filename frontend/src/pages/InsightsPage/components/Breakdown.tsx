import { ChevronRight } from 'lucide-react'
import {
  DIMENSIONS,
  SWATCH_BG,
  formatMeasure,
  isTimeDimension,
  share,
  type ChartData,
  type View,
} from '../../../utils/insights'

interface Props {
  data: ChartData
  view: View
  onDrill: (key: string) => void
}

/**
 * The panel beside a chart, saying in words what it shows: each series of a
 * split with its total (the legend), the highs and lows of a timeline, or the
 * ranking of a breakdown with each row a way into it.
 */
export function Breakdown({ data, view, onDrill }: Props) {
  if (data.series.length > 1) return <SeriesTotals data={data} view={view} />
  if (isTimeDimension(view.by)) return <TimelineStats data={data} view={view} />
  return <Ranking data={data} view={view} onDrill={onDrill} />
}

/** Measures that are parts of a whole, so a share of the total means something. */
const additive = (view: View) => view.measure === 'spent' || view.measure === 'received' || view.measure === 'count'

function SeriesTotals({ data, view }: Omit<Props, 'onDrill'>) {
  const sum = data.series.reduce((a, s) => a + s.total, 0)
  return (
    <ul aria-label="Series" className="space-y-1">
      {data.series.map((s) => (
        <li key={s.key} className="flex items-center gap-3 rounded-xl px-3 py-2">
          <span aria-hidden className={`size-2.5 shrink-0 rounded-sm ${SWATCH_BG[s.swatch]}`} />
          <span className="min-w-0 flex-1 truncate text-sm text-subtle">{s.label}</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatMeasure(view.measure, s.total)}
          </span>
          {additive(view) && (
            <span className="w-10 text-right text-xs tabular-nums text-muted">{share(s.total, sum)}</span>
          )}
        </li>
      ))}
      {view.measure === 'flow' && (
        <li className="mt-1 flex items-center gap-3 border-t border-line px-3 pt-3">
          <span className="flex-1 text-sm text-subtle">Net</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">{formatMeasure('net', data.total)}</span>
        </li>
      )}
    </ul>
  )
}

function TimelineStats({ data, view }: Omit<Props, 'onDrill'>) {
  const unit = DIMENSIONS.find((d) => d.value === view.by)!.label.toLowerCase()
  const values = data.points.map((p) => p.total)
  const peak = data.points.reduce((best, p) => (p.total > best.total ? p : best))
  const low = data.points.reduce((worst, p) => (p.total < worst.total ? p : worst))
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const stats = [
    { label: view.measure === 'average' ? 'Overall' : 'Total', value: data.total, note: null },
    { label: `Average per ${unit}`, value: mean, note: null },
    { label: 'Highest', value: peak.total, note: peak.title },
    { label: 'Lowest', value: low.total, note: low.title },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl bg-surface-raised px-4 py-3">
          <dt className="text-xs font-medium text-subtle">{s.label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
            {formatMeasure(view.measure, s.value)}
            {s.note && <span className="ml-2 text-xs font-normal text-muted">{s.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Ranking({ data, view, onDrill }: Props) {
  const sum = data.points.reduce((a, p) => a + p.total, 0)
  const max = Math.max(...data.points.map((p) => Math.abs(p.total)))
  // A donut's slices need their colors spelled out; a bar chart's are all one.
  const keyed = view.chart === 'pie'

  return (
    <ul aria-label="Breakdown" className="space-y-0.5">
      {data.points.map((p) => {
        const body = (
          <>
            <span className="flex items-center gap-2.5">
              {keyed && <span aria-hidden className={`size-2.5 shrink-0 rounded-sm ${SWATCH_BG[p.swatch]}`} />}
              <span className="min-w-0 flex-1 truncate text-left text-sm text-foreground">{p.title}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatMeasure(view.measure, p.total)}
              </span>
              {additive(view) && (
                <span className="w-9 text-right text-xs tabular-nums text-muted">{share(p.total, sum)}</span>
              )}
              {p.drill && <ChevronRight aria-hidden size={14} className="-mr-1 shrink-0 text-muted" />}
            </span>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-hover">
              <span
                className={`block h-full rounded-full ${p.total < 0 ? 'bg-negative' : keyed ? SWATCH_BG[p.swatch] : 'bg-chart-1'}`}
                style={{ width: `${max > 0 ? (Math.abs(p.total) / max) * 100 : 0}%` }}
              />
            </span>
          </>
        )
        return (
          <li key={p.key}>
            {p.drill ? (
              <button
                type="button"
                aria-label={`Explore ${p.title}`}
                onClick={() => onDrill(p.key)}
                className="block w-full rounded-xl px-3 py-2 transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-primary"
              >
                {body}
              </button>
            ) : (
              <div className="px-3 py-2">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
