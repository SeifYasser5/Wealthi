import type { Ref } from 'react'
import { X } from 'lucide-react'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { Select } from '../../../components/Select'
import {
  CHART_KINDS,
  DIMENSIONS,
  MEASURES,
  SPLITS,
  chartKinds,
  describeView,
  isTimeDimension,
  splitChoices,
  type ChartData,
  type Dimension,
  type Measure,
  type Split,
  type View,
} from '../../../utils/insights'
import { plural } from '../../../utils/utils'
import { Breakdown } from './Breakdown'
import { InsightChart } from './InsightChart'

interface Props {
  chart: ChartData
  view: View
  /** Rows in scope: zero shows the empty state instead of a chart of nothing. */
  count: number
  period: string
  onChange: (patch: Partial<View>) => void
  onDrill: (key: string) => void
  /** The page scrolls here when a category card opens a chart. */
  ref: Ref<HTMLElement>
}

/**
 * The chart builder, read as a sentence: "Show Spending by Category split by
 * Nothing". Every choice is offered only where it can be drawn, and the chart
 * type switches between the kinds that fit.
 */
export function ExploreCard({ chart, view, count, period, onChange, onDrill, ref }: Props) {
  const kinds = chartKinds(view)
  const splits = splitChoices(view)

  return (
    <section ref={ref} aria-label="Explore" className="scroll-mt-2 rounded-3xl bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{describeView(view)}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {period} · {view.currency} · {plural(count, 'transaction')}
          </p>
        </div>
        <SegmentedControl
          label="Chart type"
          value={view.chart}
          options={CHART_KINDS.filter((k) => kinds.includes(k.value))}
          onChange={(chart) => onChange({ chart })}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-subtle">
        <span>Show</span>
        <Select label="Measure" value={view.measure} onChange={(measure) => onChange({ measure: measure as Measure })}>
          {MEASURES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <span>by</span>
        <Select label="Group by" value={view.by} onChange={(by) => onChange({ by: by as Dimension })}>
          {DIMENSIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        {splits.length > 1 && (
          <>
            <span>split by</span>
            <Select label="Split by" value={view.split} onChange={(split) => onChange({ split: split as Split })}>
              {SPLITS.filter((s) => splits.includes(s.value)).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </>
        )}
        {view.category && (
          <FilterChip name="category" value={view.category} onClear={() => onChange({ category: '' })} />
        )}
        {view.merchant && (
          <FilterChip name="merchant" value={view.merchant} onClear={() => onChange({ merchant: '' })} />
        )}
      </div>

      <div className="mt-6">
        {count === 0 ? (
          <p className="rounded-2xl bg-surface-raised py-16 text-center text-sm text-muted">
            Nothing to show for {period}. Try a longer period or clear a filter.
          </p>
        ) : view.chart === 'table' || (view.chart === 'bar' && !isTimeDimension(view.by) && view.by !== 'weekday') ? (
          // A table, and ranked bars with their values at the tips, already say everything a side panel would.
          <InsightChart data={chart} view={view} onDrill={onDrill} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <InsightChart data={chart} view={view} onDrill={onDrill} />
            </div>
            <Breakdown data={chart} view={view} onDrill={onDrill} />
          </div>
        )}
      </div>
    </section>
  )
}

/** A filter set by drilling into a chart, shown so it is never a surprise, and one click to lift. */
function FilterChip({ name, value, onClear }: { name: string; value: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-9 items-center gap-1 rounded-full bg-primary-soft pr-1 pl-4 text-sm font-medium text-primary">
      {value}
      <button
        type="button"
        aria-label={`Clear ${name} filter`}
        onClick={onClear}
        className="grid size-7 place-items-center rounded-full transition-colors hover:bg-primary-line focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X aria-hidden size={14} />
      </button>
    </span>
  )
}
