import { useId, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  DIMENSIONS,
  compactNumber,
  cssColor,
  formatMeasure,
  isTimeDimension,
  type ChartData,
  type View,
} from '../../../utils/insights'
import { ChartTooltip, share, type Datum } from './ChartTooltip'

interface Props {
  data: ChartData
  view: View
  /** Narrows the view to a point; only called for points marked `drill`. */
  onDrill: (key: string) => void
}

/** Axis text in the muted ink, never the series color; no axis rules or tick marks. */
const AXIS = { tick: { fill: 'var(--color-muted)', fontSize: 12 }, axisLine: false, tickLine: false } as const
const GRID = 'var(--color-line)'
const SURFACE = 'var(--color-surface)'
/** Bars stay thin however much room they get. */
const MAX_BAR = 24

/** A long merchant name ends in an ellipsis rather than running off the axis. */
const clip = (text: string) => (text.length > 20 ? `${text.slice(0, 19)}…` : text)

/** The chart a view asks for: bars, a donut, a trend line or a plain table. */
export function InsightChart({ data, view, onDrill }: Props) {
  const rows: Datum[] = data.points.map((p) => ({
    key: p.key,
    label: p.label,
    title: p.title,
    swatch: p.swatch,
    drill: p.drill,
    ...p.values,
  }))
  const drill = (datum: Datum) => {
    if (datum.drill) onDrill(datum.key)
  }

  switch (view.chart) {
    case 'pie':
      return <Donut rows={rows} view={view} drill={drill} />
    case 'line':
      return <Trend rows={rows} data={data} view={view} />
    case 'table':
      return <ChartTable data={data} view={view} onDrill={onDrill} />
    default:
      return <Bars rows={rows} data={data} view={view} drill={drill} />
  }
}

/**
 * Columns along a timeline or the weekdays; ranked horizontal bars for names,
 * which read better sideways. A split stacks; cash flow and averages sit side
 * by side, since neither adds up. Net is green above zero and red below.
 */
function Bars({ rows, data, view, drill }: { rows: Datum[]; data: ChartData; view: View; drill: (d: Datum) => void }) {
  const horizontal = !isTimeDimension(view.by) && view.by !== 'weekday'
  const stacked = data.series.length > 1 && view.measure !== 'average' && view.measure !== 'flow'
  const signed = view.measure === 'net' && data.series.length === 1
  const height = horizontal ? Math.max(200, rows.length * 36 + 32) : 300
  const end: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
  // Ranked bars carry their value at the tip, so they need no panel beside them.
  const tipLabels = horizontal && data.series.length === 1

  return (
    <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
      <BarChart
        data={rows}
        layout={horizontal ? 'vertical' : 'horizontal'}
        stackOffset="sign"
        barCategoryGap="24%"
        margin={{ top: 8, right: tipLabels ? 64 : 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke={GRID} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <XAxis type="number" tickFormatter={compactNumber} {...AXIS} />
        ) : (
          <XAxis type="category" dataKey="label" minTickGap={12} {...AXIS} />
        )}
        {horizontal ? (
          <YAxis type="category" dataKey="label" width={168} tickFormatter={clip} {...AXIS} />
        ) : (
          <YAxis type="number" width={52} tickFormatter={compactNumber} {...AXIS} />
        )}
        {signed && (horizontal ? <ReferenceLine x={0} stroke={GRID} /> : <ReferenceLine y={0} stroke={GRID} />)}
        <Tooltip
          cursor={{ fill: 'var(--color-surface-raised)' }}
          content={(p) => (
            <ChartTooltip active={p.active} payload={p.payload} measure={view.measure} series={data.series} />
          )}
        />
        {data.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={cssColor(s.swatch)}
            stackId={stacked ? 'stack' : undefined}
            maxBarSize={MAX_BAR}
            // Only a stack's outer segment gets the rounded end; inner ones meet square, a surface hairline apart.
            radius={!stacked || i === data.series.length - 1 ? end : 0}
            stroke={stacked ? SURFACE : undefined}
            strokeWidth={stacked ? 1 : 0}
            cursor={horizontal ? 'pointer' : 'default'}
            onClick={(bar) => drill(bar.payload as Datum)}
          >
            {signed &&
              rows.map((r) => <Cell key={r.key} fill={cssColor(Number(r.value) < 0 ? 'negative' : 'positive')} />)}
            {tipLabels && (
              <LabelList
                dataKey={s.key}
                position="right"
                offset={8}
                formatter={(value) => formatMeasure(view.measure, Number(value))}
                style={{ fill: 'var(--color-subtle)', fontSize: 12, fontWeight: 600 }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Parts of a whole. The hole reads the total, or the slice under the pointer. */
function Donut({ rows, view, drill }: { rows: Datum[]; view: View; drill: (d: Datum) => void }) {
  const [active, setActive] = useState<number | null>(null)
  const sum = rows.reduce((a, r) => a + Number(r.value), 0)
  const focus = active === null ? null : rows[active]

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      <ResponsiveContainer width="100%" height={300} initialDimension={{ width: 300, height: 300 }}>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            innerRadius="70%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={rows.length > 1 ? 1.5 : 0}
            cornerRadius={4}
            stroke="none"
            isAnimationActive={false}
            onMouseEnter={(_, index) => setActive(index)}
            onClick={(slice) => drill(slice.payload as Datum)}
          >
            {rows.map((r) => (
              <Cell key={r.key} fill={cssColor(r.swatch)} cursor={r.drill ? 'pointer' : 'default'} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div aria-live="polite" className="max-w-40">
          <p className="truncate text-xs font-medium text-subtle">{focus ? focus.title : 'Total'}</p>
          <p className="text-3xl font-bold tracking-tight text-foreground">
            {formatMeasure(view.measure, focus ? Number(focus.value) : sum)}
          </p>
          <p className="text-xs text-muted">{focus ? share(Number(focus.value), sum) : '100%'}</p>
        </div>
      </div>
    </div>
  )
}

/** Change over time: one series is a line over a fading wash, several are plain lines. */
function Trend({ rows, data, view }: { rows: Datum[]; data: ChartData; view: View }) {
  // useId's colons would break the url(#…) reference.
  const id = `trend${useId().replace(/[^\w-]/g, '')}`
  const tooltip = (
    <Tooltip
      cursor={{ stroke: 'var(--color-subtle)', strokeWidth: 1 }}
      content={(p) => (
        <ChartTooltip active={p.active} payload={p.payload} measure={view.measure} series={data.series} />
      )}
    />
  )
  const xAxis = <XAxis dataKey="label" minTickGap={16} {...AXIS} />
  const yAxis = <YAxis width={52} tickFormatter={compactNumber} {...AXIS} />
  const grid = <CartesianGrid stroke={GRID} vertical={false} />
  const zero = view.measure === 'net' && <ReferenceLine y={0} stroke="var(--color-subtle)" />
  const activeDot = { r: 4, stroke: SURFACE, strokeWidth: 2 }
  const margin = { top: 8, right: 8, bottom: 0, left: 0 }

  if (data.series.length === 1) {
    const [s] = data.series
    const color = cssColor(s.swatch)
    return (
      <ResponsiveContainer width="100%" height={300} initialDimension={{ width: 640, height: 300 }}>
        <AreaChart data={rows} margin={margin}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid}
          {xAxis}
          {yAxis}
          {zero}
          {tooltip}
          <Area
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            dot={false}
            activeDot={{ ...activeDot, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300} initialDimension={{ width: 640, height: 300 }}>
      <LineChart data={rows} margin={margin}>
        {grid}
        {xAxis}
        {yAxis}
        {zero}
        {tooltip}
        {data.series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={cssColor(s.swatch)}
            strokeWidth={2}
            dot={false}
            activeDot={{ ...activeDot, fill: cssColor(s.swatch) }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * Every number behind the chart, with nothing folded away: a row per point, a
 * column per series, and the totals underneath. Also the way to see a chart
 * without relying on color or hover.
 */
function ChartTable({ data, view, onDrill }: Props) {
  const multi = data.series.length > 1
  // Averages don't add across series; cash flow's last column is its net.
  const totalColumn = multi && view.measure !== 'average'
  const format = (value: number) => formatMeasure(view.measure, value)
  const cell = 'py-2.5 pl-4 text-right tabular-nums'
  const dimension = DIMENSIONS.find((d) => d.value === view.by)!.label

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th scope="col" className="py-2 text-left font-medium">
            {dimension}
          </th>
          {data.series.map((s) => (
            <th key={s.key} scope="col" className="py-2 pl-4 text-right font-medium">
              {s.label}
            </th>
          ))}
          {totalColumn && (
            <th scope="col" className="py-2 pl-4 text-right font-medium">
              {view.measure === 'flow' ? 'Net' : 'Total'}
            </th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {data.points.map((p) => (
          <tr key={p.key}>
            <th scope="row" className="py-2.5 text-left font-medium text-foreground">
              {p.drill ? (
                <button
                  type="button"
                  onClick={() => onDrill(p.key)}
                  className="rounded text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {p.title}
                </button>
              ) : (
                p.title
              )}
            </th>
            {data.series.map((s) => (
              <td key={s.key} className={`${cell} text-subtle`}>
                {format(p.values[s.key])}
              </td>
            ))}
            {totalColumn && (
              <td className={`${cell} font-medium text-foreground`}>
                {format(view.measure === 'flow' ? p.values.received - p.values.spent : p.total)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-line font-semibold text-foreground">
          <th scope="row" className="py-2.5 text-left">
            {view.measure === 'average' ? 'Overall' : 'Total'}
          </th>
          {data.series.map((s) => (
            <td key={s.key} className={cell}>
              {format(s.total)}
            </td>
          ))}
          {totalColumn && <td className={cell}>{format(data.total)}</td>}
        </tr>
      </tfoot>
    </table>
  )
}
