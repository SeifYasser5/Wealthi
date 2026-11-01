// The Insights page's engine: every chart is one `View` (what to measure, what
// to group it by, what to split it into) over the rows GET /api/insights sends.
// Pure functions only, so the page stays a thin renderer and every number it
// shows is pinned here by a unit test.

import type { AccountId, Currency, InsightRow } from '@wealthi/shared'
import { currentYearMonth, money, shiftYearMonth } from './utils'

// ─── Views ───────────────────────────────────────────────────────────────────

/** What a chart adds up. `flow` is income and spending side by side. */
export type Measure = 'spent' | 'received' | 'net' | 'flow' | 'count' | 'average'
/** What a chart groups by: one bar, slice or point per value. */
export type Dimension = 'category' | 'merchant' | 'account' | 'month' | 'week' | 'day' | 'weekday'
/** What each bar or point is split into: one series per value. */
export type Split = 'none' | 'category' | 'merchant' | 'account'
export type ChartKind = 'bar' | 'pie' | 'line' | 'table'
export type Range = '1m' | '3m' | '6m' | '12m' | 'all'

/** Everything that decides a chart. Lives in the URL, so a view can be bookmarked. */
export interface View {
  range: Range
  measure: Measure
  by: Dimension
  split: Split
  chart: ChartKind
  /** Amounts in different currencies never add up, so a view shows one. */
  currency: Currency
  /** '' means every account. */
  account: AccountId | ''
  /** Exact category name; '' means every category. */
  category: string
  /** Case-insensitive substring, as on the Transactions page; '' means every merchant. */
  merchant: string
}

export const MEASURES: readonly { value: Measure; label: string }[] = [
  { value: 'spent', label: 'Spending' },
  { value: 'received', label: 'Income' },
  { value: 'net', label: 'Net' },
  { value: 'flow', label: 'Cash flow' },
  { value: 'count', label: 'Transactions' },
  { value: 'average', label: 'Average spend' },
]

export const DIMENSIONS: readonly { value: Dimension; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'merchant', label: 'Merchant' },
  { value: 'account', label: 'Account' },
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'weekday', label: 'Weekday' },
]

export const SPLITS: readonly { value: Split; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'category', label: 'Category' },
  { value: 'merchant', label: 'Merchant' },
  { value: 'account', label: 'Account' },
]

export const CHART_KINDS: readonly { value: ChartKind; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'pie', label: 'Pie' },
  { value: 'line', label: 'Line' },
  { value: 'table', label: 'Table' },
]

export const RANGES: readonly { value: Range; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '1Y' },
  { value: 'all', label: 'All' },
]

const MONTHS_IN: Record<Exclude<Range, 'all'>, number> = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }

/** The view the page opens on: where the last six months' money went. */
export const DEFAULT_VIEW: Omit<View, 'currency'> = {
  range: '6m',
  measure: 'spent',
  by: 'category',
  split: 'none',
  chart: 'pie',
  account: '',
  category: '',
  merchant: '',
}

/** The one-click views, in the order the shortcut row shows them. */
export const PRESETS: readonly { id: string; label: string; view: Pick<View, 'measure' | 'by' | 'split' | 'chart'> }[] =
  [
    { id: 'where', label: 'Where it goes', view: { measure: 'spent', by: 'category', split: 'none', chart: 'pie' } },
    { id: 'flow', label: 'Cash flow', view: { measure: 'flow', by: 'month', split: 'none', chart: 'bar' } },
    { id: 'trends', label: 'Category trends', view: { measure: 'spent', by: 'month', split: 'category', chart: 'line' } }, // prettier-ignore
    {
      id: 'merchants',
      label: 'Top merchants',
      view: { measure: 'spent', by: 'merchant', split: 'none', chart: 'bar' },
    },
    { id: 'savings', label: 'Net savings', view: { measure: 'net', by: 'month', split: 'none', chart: 'bar' } },
    { id: 'rhythm', label: 'Weekly rhythm', view: { measure: 'spent', by: 'weekday', split: 'none', chart: 'bar' } },
    { id: 'daily', label: 'Daily spend', view: { measure: 'spent', by: 'day', split: 'none', chart: 'line' } },
    { id: 'accounts', label: 'By account', view: { measure: 'spent', by: 'account', split: 'none', chart: 'pie' } },
  ]

export function isPreset(view: View, preset: (typeof PRESETS)[number]): boolean {
  const p = preset.view
  return view.measure === p.measure && view.by === p.by && view.split === p.split && view.chart === p.chart
}

const TIME_DIMENSIONS: readonly Dimension[] = ['month', 'week', 'day']

/** Month, week and day run along a timeline: gaps are zeros and a line can join them. */
export function isTimeDimension(by: Dimension): boolean {
  return TIME_DIMENSIONS.includes(by)
}

/**
 * The chart kinds that make sense for a view. A pie needs parts of a whole: one
 * series of amounts that can't go negative and that add up. A line needs a timeline.
 */
export function chartKinds({ measure, by, split }: Pick<View, 'measure' | 'by' | 'split'>): ChartKind[] {
  const kinds: ChartKind[] = ['bar']
  if (split === 'none' && (measure === 'spent' || measure === 'received' || measure === 'count')) kinds.push('pie')
  if (isTimeDimension(by)) kinds.push('line')
  kinds.push('table')
  return kinds
}

/** A view can split by anything it isn't already grouped by; cash flow is already two series. */
export function splitChoices({ measure, by }: Pick<View, 'measure' | 'by'>): Split[] {
  if (measure === 'flow') return ['none']
  return SPLITS.map((s) => s.value).filter((s) => s !== by)
}

/** Repairs a combination that can't be drawn, e.g. a pie of net amounts, into the nearest one that can. */
export function normalizeView(view: View): View {
  const split = splitChoices(view).includes(view.split) ? view.split : 'none'
  const chart = chartKinds({ ...view, split }).includes(view.chart) ? view.chart : 'bar'
  return { ...view, split, chart }
}

const pick = <T extends string>(options: readonly { value: T }[], raw: string | null, fallback: T): T =>
  options.find((o) => o.value === raw)?.value ?? fallback

/** A view from URL params; anything unknown falls back to the default, then the result is normalized. */
export function parseView(params: URLSearchParams, currency: Currency): View {
  return normalizeView({
    range: pick(RANGES, params.get('range'), DEFAULT_VIEW.range),
    measure: pick(MEASURES, params.get('measure'), DEFAULT_VIEW.measure),
    by: pick(DIMENSIONS, params.get('by'), DEFAULT_VIEW.by),
    split: pick(SPLITS, params.get('split'), DEFAULT_VIEW.split),
    chart: pick(CHART_KINDS, params.get('chart'), DEFAULT_VIEW.chart),
    currency,
    account: params.get('account') ?? '',
    category: params.get('category') ?? '',
    merchant: params.get('merchant') ?? '',
  })
}

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((o) => o.value === value)!.label

/** "Spending by category", "Cash flow by month", "Spending by month, split by merchant". */
export function describeView({ measure, by, split }: Pick<View, 'measure' | 'by' | 'split'>): string {
  const base = `${labelOf(MEASURES, measure)} by ${labelOf(DIMENSIONS, by).toLowerCase()}`
  return split === 'none' ? base : `${base}, split by ${split}`
}

// ─── Periods ─────────────────────────────────────────────────────────────────

/** Every "YYYY-MM" from `first` through `last`, inclusive. */
function monthsBetween(first: string, last: string): string[] {
  const months: string[] = []
  for (let m = first; m <= last; m = shiftYearMonth(m, 1)) months.push(m)
  return months
}

/**
 * The months a range covers. It ends with the newest month the ledger reaches,
 * never past the current one: on the 1st, or a while after the last import, a
 * chart still ends on real data instead of on an empty month that reads as a
 * crash. `all` starts at the oldest row.
 */
export function periodMonths(range: Range, rows: readonly InsightRow[], now = currentYearMonth()): string[] {
  const newest = rows.reduce((max, r) => (r.yearMonth > max && r.yearMonth <= now ? r.yearMonth : max), '')
  const last = newest || now
  if (range !== 'all') return monthsBetween(shiftYearMonth(last, 1 - MONTHS_IN[range]), last)
  const oldest = rows.reduce((min, r) => (r.yearMonth < min ? r.yearMonth : min), last)
  return monthsBetween(oldest, last)
}

/** The same number of months just before `months`, to compare against; none for `all`. */
export function previousMonths(range: Range, months: readonly string[]): string[] | null {
  if (range === 'all') return null
  return months.map((m) => shiftYearMonth(m, -months.length))
}

/** "October 2026", "Jun – Oct 2026", "Nov 2025 – Oct 2026": the months a view covers, named. */
export function describePeriod(months: readonly string[]): string {
  const first = keyToDate(months[0])
  const last = keyToDate(months[months.length - 1])
  if (months.length === 1) return last.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const sameYear = first.getFullYear() === last.getFullYear()
  const from = first.toLocaleDateString(undefined, sameYear ? { month: 'short' } : { month: 'short', year: 'numeric' })
  return `${from} – ${last.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
}

/** The rows a view covers: its months, currency and filters. */
export function scopeRows(
  rows: readonly InsightRow[],
  months: readonly string[],
  view: Pick<View, 'currency' | 'account' | 'category' | 'merchant'>,
): InsightRow[] {
  const inPeriod = new Set(months)
  const needle = view.merchant.trim().toLowerCase()
  return rows.filter(
    (r) =>
      inPeriod.has(r.yearMonth) &&
      r.currency === view.currency &&
      (!view.account || r.account === view.account) &&
      (!view.category || r.category === view.category) &&
      (!needle || (r.merchant ?? '').toLowerCase().includes(needle)),
  )
}

/** Currencies in use, most rows first: the first is the one a view opens in. */
export function currenciesByUse(rows: readonly InsightRow[]): Currency[] {
  const counts = new Map<Currency, number>()
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

// ─── Measures ────────────────────────────────────────────────────────────────

/** Summed in whole cents so a long column of decimals never drifts. */
const cents = (amount: number) => Math.round(amount * 100)

export function measureOf(measure: Exclude<Measure, 'flow'>, rows: readonly InsightRow[]): number {
  let debit = 0
  let credit = 0
  let debits = 0
  for (const r of rows) {
    if (r.type === 'debit') {
      debit += cents(r.amount)
      debits++
    } else credit += cents(r.amount)
  }
  switch (measure) {
    case 'spent':
      return debit / 100
    case 'received':
      return credit / 100
    case 'net':
      return (credit - debit) / 100
    case 'count':
      return rows.length
    case 'average':
      return debits === 0 ? 0 : Math.round(debit / debits) / 100
  }
}

/** Only the rows a measure looks at, so a merchant you were only ever paid by never shows as a zero bar of spending. */
function relevantRows(measure: Measure, rows: readonly InsightRow[]): InsightRow[] {
  if (measure === 'spent' || measure === 'average') return rows.filter((r) => r.type === 'debit')
  if (measure === 'received') return rows.filter((r) => r.type === 'credit')
  return [...rows]
}

/** Whole units for money, a plain count for transactions. */
export function formatMeasure(measure: Measure, value: number): string {
  return measure === 'count' ? value.toLocaleString() : money(value)
}

const COMPACT = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

/** Axis ticks: in full under 10,000, compact (12K, 1.2M) from there. */
export function compactNumber(value: number): string {
  return Math.abs(value) >= 10_000 ? COMPACT.format(value) : Math.round(value).toLocaleString()
}

// ─── Colors ──────────────────────────────────────────────────────────────────

/** A token from theme.css: a categorical slot, the neutral for "Other", or in/out for cash flow. */
export type Swatch =
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5'
  | 'chart-6'
  | 'chart-7'
  | 'chart-8'
  | 'chart-other'
  | 'positive'
  | 'negative'

const SLOTS: readonly Swatch[] = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8'] // prettier-ignore

/** The swatch as an SVG fill or stroke. */
export const cssColor = (swatch: Swatch) => `var(--color-${swatch})`

/** The swatch as a background, spelled out so Tailwind finds every class. */
export const SWATCH_BG: Record<Swatch, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
  'chart-6': 'bg-chart-6',
  'chart-7': 'bg-chart-7',
  'chart-8': 'bg-chart-8',
  'chart-other': 'bg-chart-other',
  positive: 'bg-positive',
  negative: 'bg-negative',
}

type Entity = 'category' | 'merchant' | 'account'
export type Ranks = Record<Entity, ReadonlyMap<string, number>>

/**
 * Every category, merchant and account ranked by how much money went through
 * it across the whole ledger, so the biggest get the leading colors. A color is
 * handed out by this rank, not by a chart's own order, so narrowing a view never
 * repaints what survives: Dining stays the same color in every range, currency
 * and filter. (Amounts in different currencies are added here: it is an order, not a total.)
 */
export function entityRanks(rows: readonly InsightRow[]): Ranks {
  const rank = (keyOf: (r: InsightRow) => string) => {
    const volume = new Map<string, number>()
    for (const r of rows) volume.set(keyOf(r), (volume.get(keyOf(r)) ?? 0) + cents(r.amount))
    const order = [...volume.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    return new Map(order.map(([key], i) => [key, i]))
  }
  return { category: rank((r) => r.category), merchant: rank(merchantKey), account: rank((r) => r.account) }
}

/**
 * Colors for the keys on screen: each takes its ranked slot when that is free,
 * the rest fill the free slots in order, and anything past eight (only a table
 * shows that many) and "Other" take the neutral.
 */
export function assignSwatches(keys: readonly string[], rank?: ReadonlyMap<string, number>): Map<string, Swatch> {
  const out = new Map<string, Swatch>()
  const taken = new Set<number>()
  const unranked: string[] = []
  for (const key of keys) {
    const r = rank?.get(key)
    if (key === OTHER_KEY) out.set(key, 'chart-other')
    else if (r !== undefined && r < SLOTS.length && !taken.has(r)) {
      taken.add(r)
      out.set(key, SLOTS[r])
    } else unranked.push(key)
  }
  let next = 0
  for (const key of unranked) {
    while (taken.has(next)) next++
    taken.add(next)
    out.set(key, SLOTS[next] ?? 'chart-other')
  }
  return out
}

// ─── Grouping ────────────────────────────────────────────────────────────────

/** Key and label of the bucket folding everything past a chart's limit. */
export const OTHER_KEY = '__other'
export const OTHER_LABEL = 'Other'
/** Rows the parser left without a merchant; the same label as the spending breakdown. */
export const UNKNOWN_MERCHANT = '(unknown)'

const merchantKey = (r: InsightRow) => r.merchant ?? UNKNOWN_MERCHANT

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const keyToDate = (key: string) => {
  const [y, m, d = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
/** Weeks start on Monday, local time. */
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))

function keyOf(by: Dimension, r: InsightRow): string {
  switch (by) {
    case 'category':
      return r.category
    case 'merchant':
      return merchantKey(r)
    case 'account':
      return r.account
    case 'month':
      return r.yearMonth
    case 'week':
      return dayKey(mondayOf(new Date(r.transactedAt)))
    case 'day':
      return dayKey(new Date(r.transactedAt))
    case 'weekday':
      return String((new Date(r.transactedAt).getDay() + 6) % 7)
  }
}

/** Every bucket a timeline has in `months`, empty or not, through `today` and no further. */
function timeline(by: 'month' | 'week' | 'day', months: readonly string[], today: Date): string[] {
  if (by === 'month') return [...months]
  const [ly, lm] = months[months.length - 1].split('-').map(Number)
  const lastDay = new Date(ly, lm, 0)
  const end = lastDay < today ? lastDay : today
  const keys: string[] = []
  const step = by === 'week' ? 7 : 1
  const first = keyToDate(months[0])
  for (
    let d = by === 'week' ? mondayOf(first) : first;
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step)
  )
    keys.push(dayKey(d))
  return keys
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(2024, 0, 1 + i)) // 1 Jan 2024 was a Monday

/** The short label on an axis and the long one in a tooltip. */
function labelsFor(by: Dimension, key: string, accountLabel: (id: string) => string, multiYear: boolean) {
  if (key === OTHER_KEY) return { label: OTHER_LABEL, title: OTHER_LABEL }
  switch (by) {
    case 'account':
      return { label: accountLabel(key), title: accountLabel(key) }
    case 'month': {
      const d = keyToDate(key)
      return {
        label: d.toLocaleDateString(undefined, multiYear ? { month: 'short', year: '2-digit' } : { month: 'short' }),
        title: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      }
    }
    case 'week': {
      const d = keyToDate(key)
      return {
        label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        title: `Week of ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
      }
    }
    case 'day': {
      const d = keyToDate(key)
      return {
        label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        title: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      }
    }
    case 'weekday': {
      const d = WEEKDAYS[Number(key)]
      return {
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        title: d.toLocaleDateString(undefined, { weekday: 'long' }),
      }
    }
    default:
      return { label: key, title: key }
  }
}

/** Where clicking a bar or a row of the breakdown leads: into that category, merchant or account. */
export function drillInto(by: Dimension, key: string): Partial<View> | null {
  if (key === OTHER_KEY || key === UNKNOWN_MERCHANT) return null
  if (by === 'category') return { category: key, by: 'merchant' }
  if (by === 'merchant') return { merchant: key, by: 'month' }
  if (by === 'account') return { account: key, by: 'category' }
  return null
}

// ─── Charts ──────────────────────────────────────────────────────────────────

export interface ChartSeries {
  /** The property each point holds this series' value under. */
  key: string
  label: string
  swatch: Swatch
  total: number
}

export interface ChartPoint {
  key: string
  /** Short, for an axis. */
  label: string
  /** Long, for a tooltip or a table row. */
  title: string
  /** This point's color where it is a slice or a row of its own. */
  swatch: Swatch
  /** Each series' value, by series key. */
  values: Record<string, number>
  /** Every series' value added up. */
  total: number
  /** Whether clicking it narrows the view to it. */
  drill: boolean
}

export interface ChartData {
  points: ChartPoint[]
  series: ChartSeries[]
  /** The measure over every row the chart covers: for cash flow, the net. */
  total: number
}

export interface ChartContext {
  months: readonly string[]
  ranks: Ranks
  accountLabel: (id: string) => string
  today?: Date
}

/** Bars a chart shows before folding the rest into "Other"; a table shows them all. */
const POINT_LIMIT: Record<ChartKind, number> = { bar: 12, pie: 6, line: 12, table: Infinity }
/** Series a split shows before folding the rest into "Other". */
const SERIES_LIMIT = 6

/** The `limit` biggest keys, then everything else as one "Other" (unless that would be a single key). */
function topKeys(groups: Map<string, InsightRow[]>, score: (rows: InsightRow[]) => number, limit: number) {
  const ranked = [...groups.entries()]
    .map(([key, rows]) => ({ key, score: score(rows) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .map((g) => g.key)
  if (ranked.length <= limit + 1) return { keys: ranked, folded: [] }
  return { keys: [...ranked.slice(0, limit), OTHER_KEY], folded: ranked.slice(limit) }
}

function groupBy(rows: readonly InsightRow[], keyFn: (r: InsightRow) => string) {
  const groups = new Map<string, InsightRow[]>()
  for (const r of rows) {
    const key = keyFn(r)
    const group = groups.get(key)
    if (group) group.push(r)
    else groups.set(key, [r])
  }
  return groups
}

/** Turns scoped rows into the points and series a chart draws, whatever the view. */
export function buildChart(scoped: readonly InsightRow[], view: View, ctx: ChartContext): ChartData {
  const { measure, by, split, chart } = view
  const rows = relevantRows(measure, scoped)
  const total = measureOf(measure === 'flow' ? 'net' : measure, rows)
  const score = (group: InsightRow[]) =>
    measure === 'flow' ? measureOf('spent', group) + measureOf('received', group) : measureOf(measure, group)

  // The series: one, income and spending, or one per value of the split.
  let series: { key: string; label: string; swatch: Swatch; value: (group: InsightRow[]) => number }[]
  if (measure === 'flow') {
    series = [
      { key: 'received', label: 'Income', swatch: 'positive', value: (g) => measureOf('received', g) },
      { key: 'spent', label: 'Spending', swatch: 'negative', value: (g) => measureOf('spent', g) },
    ]
  } else if (split === 'none') {
    series = [
      { key: 'value', label: labelOf(MEASURES, measure), swatch: 'chart-1', value: (g) => measureOf(measure, g) },
    ]
  } else {
    const { keys, folded } = topKeys(
      groupBy(rows, (r) => keyOf(split, r)),
      score,
      SERIES_LIMIT,
    )
    const swatches = assignSwatches(keys, ctx.ranks[split])
    const foldedSet = new Set(folded)
    series = keys.map((key) => {
      const inSeries = key === OTHER_KEY ? (r: InsightRow) => foldedSet.has(keyOf(split, r)) : (r: InsightRow) => keyOf(split, r) === key // prettier-ignore
      return {
        key: `s:${key}`,
        label: labelsFor(split, key, ctx.accountLabel, false).label,
        swatch: swatches.get(key)!,
        value: (g) => measureOf(measure, g.filter(inSeries)),
      }
    })
  }

  // The points: a full timeline, the seven weekdays, or the biggest values.
  const groups = groupBy(rows, (r) => keyOf(by, r))
  let keys: string[]
  let folded: string[] = []
  if (by === 'month' || by === 'week' || by === 'day') keys = timeline(by, ctx.months, ctx.today ?? new Date())
  else if (by === 'weekday') keys = ['0', '1', '2', '3', '4', '5', '6']
  else ({ keys, folded } = topKeys(groups, score, POINT_LIMIT[chart]))

  const groupOf = (key: string) => (key === OTHER_KEY ? folded.flatMap((k) => groups.get(k)!) : (groups.get(key) ?? []))
  const multiYear = new Set(ctx.months.map((m) => m.slice(0, 4))).size > 1
  const swatches = assignSwatches(keys, by === 'category' || by === 'merchant' || by === 'account' ? ctx.ranks[by] : undefined) // prettier-ignore

  const points = keys.map((key): ChartPoint => {
    const group = groupOf(key)
    const values = Object.fromEntries(series.map((s) => [s.key, s.value(group)]))
    return {
      key,
      ...labelsFor(by, key, ctx.accountLabel, multiYear),
      swatch: swatches.get(key)!,
      values,
      total: Object.values(values).reduce((a, b) => a + b, 0),
      drill: drillInto(by, key) !== null,
    }
  })

  return {
    points,
    series: series.map(({ key, label, swatch, value }) => ({ key, label, swatch, total: value(rows) })),
    total,
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface Summary {
  spent: number
  received: number
  net: number
  /** Net as a percent of income; null with no income to save from. */
  savingsRate: number | null
  /** One value per month of the period, oldest first. */
  monthly: { spent: number[]; received: number[]; net: number[] }
}

/** The headline numbers over scoped rows, and their month-by-month shape. */
export function summarize(scoped: readonly InsightRow[], months: readonly string[]): Summary {
  const byMonth = groupBy(scoped, (r) => r.yearMonth)
  const per = (measure: 'spent' | 'received' | 'net') => months.map((m) => measureOf(measure, byMonth.get(m) ?? []))
  const received = measureOf('received', scoped)
  const net = measureOf('net', scoped)
  return {
    spent: measureOf('spent', scoped),
    received,
    net,
    savingsRate: received > 0 ? (net / received) * 100 : null,
    monthly: { spent: per('spent'), received: per('received'), net: per('net') },
  }
}

/** Percent change from `previous`; null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100
}

export interface CategoryTrend {
  category: string
  total: number
  /** Spending per month of the period, oldest first. */
  monthly: number[]
  average: number
  /** The period's last month. */
  latest: number
  /**
   * What the earlier months had spent by the same day of the month, on
   * average: the fair yardstick for a month still in progress. Null with no
   * earlier month to compare with.
   */
  usual: number | null
}

/**
 * Each category's spending month by month, the biggest first. `cutoffDay` is
 * how far into its month the last one has got: today's date while it is the
 * current month, 31 once it is over.
 */
export function categoryTrends(
  scoped: readonly InsightRow[],
  months: readonly string[],
  cutoffDay: number,
): CategoryTrend[] {
  const groups = groupBy(
    scoped.filter((r) => r.type === 'debit'),
    (r) => r.category,
  )
  const earlier = months.slice(0, -1)
  return [...groups.entries()]
    .map(([category, rows]) => {
      const byMonth = groupBy(rows, (r) => r.yearMonth)
      const monthly = months.map((m) => measureOf('spent', byMonth.get(m) ?? []))
      const total = measureOf('spent', rows)
      const byThisDay = (m: string) =>
        measureOf(
          'spent',
          (byMonth.get(m) ?? []).filter((r) => new Date(r.transactedAt).getDate() <= cutoffDay),
        )
      return {
        category,
        total,
        monthly,
        average: total / months.length,
        latest: monthly[monthly.length - 1],
        usual: earlier.length === 0 ? null : earlier.reduce((sum, m) => sum + byThisDay(m), 0) / earlier.length,
      }
    })
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))
}
