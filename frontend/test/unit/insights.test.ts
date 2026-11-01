import { describe, expect, it } from 'vitest'
import type { InsightRow } from '@wealthi/shared'
import {
  DEFAULT_VIEW,
  OTHER_KEY,
  PRESETS,
  assignSwatches,
  buildChart,
  categoryTrends,
  chartKinds,
  compactNumber,
  currenciesByUse,
  describePeriod,
  describeView,
  drillInto,
  entityRanks,
  formatMeasure,
  isPreset,
  isTimeDimension,
  measureOf,
  normalizeView,
  parseView,
  percentChange,
  periodMonths,
  previousMonths,
  scopeRows,
  splitChoices,
  summarize,
  type ChartContext,
  type View,
} from '../../src/utils/insights'

let n = 0
/** A synthetic row: an EGP card debit on 10 Jan 2026 unless told otherwise. */
const row = (over: Partial<InsightRow> & Pick<InsightRow, 'amount'>): InsightRow => {
  const transactedAt = over.transactedAt ?? '2026-01-10T12:00:00.000Z'
  return {
    id: `r${++n}`,
    yearMonth: transactedAt.slice(0, 7),
    transactedAt,
    type: 'debit',
    currency: 'EGP',
    account: 'card',
    merchant: 'ACME GROCERS',
    category: 'Groceries',
    ...over,
  }
}

const view = (over: Partial<View> = {}): View => ({ ...DEFAULT_VIEW, currency: 'EGP', ...over })
const NO_RANKS = { category: new Map(), merchant: new Map(), account: new Map() }
const ctx = (over: Partial<ChartContext> = {}): ChartContext => ({
  months: ['2026-01'],
  ranks: NO_RANKS,
  accountLabel: (id) => `#${id}`,
  today: new Date(2026, 0, 31),
  ...over,
})

describe('views', () => {
  it('knows which views each preset is', () => {
    const where = PRESETS.find((p) => p.id === 'where')!
    expect(isPreset(view(), where)).toBe(true)
    expect(isPreset(view({ chart: 'bar' }), where)).toBe(false)
  })

  it('offers a pie only for parts of a whole, and a line only along a timeline', () => {
    expect(chartKinds({ measure: 'spent', by: 'category', split: 'none' })).toEqual(['bar', 'pie', 'table'])
    expect(chartKinds({ measure: 'count', by: 'month', split: 'none' })).toEqual(['bar', 'pie', 'line', 'table'])
    expect(chartKinds({ measure: 'net', by: 'week', split: 'none' })).toEqual(['bar', 'line', 'table'])
    expect(chartKinds({ measure: 'spent', by: 'day', split: 'account' })).toEqual(['bar', 'line', 'table'])
    expect(isTimeDimension('weekday')).toBe(false)
  })

  it('splits by anything but the grouping, and never splits cash flow', () => {
    expect(splitChoices({ measure: 'spent', by: 'category' })).toEqual(['none', 'merchant', 'account'])
    expect(splitChoices({ measure: 'flow', by: 'month' })).toEqual(['none'])
  })

  it('repairs a view that cannot be drawn', () => {
    expect(normalizeView(view({ measure: 'net', chart: 'pie' })).chart).toBe('bar')
    expect(normalizeView(view({ by: 'category', split: 'category' })).split).toBe('none')
    // Dropping the split makes the pie possible again.
    expect(normalizeView(view({ measure: 'flow', split: 'category', chart: 'line', by: 'month' }))).toMatchObject({
      split: 'none',
      chart: 'line',
    })
  })

  it('reads a view from the URL, falling back to the default for anything unknown', () => {
    expect(parseView(new URLSearchParams(), 'EGP')).toEqual(view())
    const parsed = parseView(
      new URLSearchParams(
        'range=12m&measure=flow&by=week&split=nope&chart=line&account=card&category=Dining&merchant=acme',
      ),
      'USD',
    )
    expect(parsed).toEqual({
      range: '12m',
      measure: 'flow',
      by: 'week',
      split: 'none',
      chart: 'line',
      currency: 'USD',
      account: 'card',
      category: 'Dining',
      merchant: 'acme',
    })
  })

  it('describes a view as a phrase', () => {
    expect(describeView(view())).toBe('Spending by category')
    expect(describeView(view({ measure: 'flow', by: 'month' }))).toBe('Cash flow by month')
    expect(describeView(view({ by: 'month', split: 'merchant' }))).toBe('Spending by month, split by merchant')
  })
})

describe('periods', () => {
  const rows = [row({ amount: 1, transactedAt: '2025-11-03T12:00:00.000Z' }), row({ amount: 1, transactedAt: '2026-02-03T12:00:00.000Z' })] // prettier-ignore

  it('ends on the newest month with data, never past now', () => {
    expect(periodMonths('3m', rows, '2026-04')).toEqual(['2025-12', '2026-01', '2026-02'])
    // The February row is in the future, so the newest month with data is November.
    expect(periodMonths('1m', rows, '2026-01')).toEqual(['2025-11'])
    expect(periodMonths('1m', [], '2026-04')).toEqual(['2026-04'])
  })

  it('runs from the oldest row for all time', () => {
    expect(periodMonths('all', rows, '2026-04')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('compares with the same number of months just before, except for all time', () => {
    expect(previousMonths('3m', ['2026-01', '2026-02', '2026-03'])).toEqual(['2025-10', '2025-11', '2025-12'])
    expect(previousMonths('all', ['2026-01'])).toBeNull()
  })

  it('names the months', () => {
    expect(describePeriod(['2026-03'])).toBe('March 2026')
    expect(describePeriod(['2026-01', '2026-02', '2026-03'])).toBe('Jan – Mar 2026')
    expect(describePeriod(['2025-12', '2026-01'])).toBe('Dec 2025 – Jan 2026')
  })
})

describe('scopeRows', () => {
  const rows = [
    row({ id: 'a', amount: 1 }),
    row({ id: 'b', amount: 1, currency: 'USD', account: 'savings_usd' }),
    row({ id: 'c', amount: 1, account: 'checking', category: 'Dining', merchant: 'City Cafe' }),
    row({ id: 'd', amount: 1, merchant: null }),
    row({ id: 'e', amount: 1, transactedAt: '2026-02-01T12:00:00.000Z' }),
  ]
  const ids = (over: Partial<View>) => scopeRows(rows, ['2026-01'], view(over)).map((r) => r.id)

  it('keeps the period and the currency', () => {
    expect(ids({})).toEqual(['a', 'c', 'd'])
    expect(ids({ currency: 'USD' })).toEqual(['b'])
  })

  it('narrows by account, exact category and merchant substring', () => {
    expect(ids({ account: 'checking' })).toEqual(['c'])
    expect(ids({ category: 'Dining' })).toEqual(['c'])
    expect(ids({ merchant: ' cafe ' })).toEqual(['c'])
  })

  it('lists currencies most used first', () => {
    expect(currenciesByUse(rows)).toEqual(['EGP', 'USD'])
    expect(currenciesByUse([])).toEqual([])
  })
})

describe('measures', () => {
  const rows = [row({ amount: 0.1 }), row({ amount: 0.2 }), row({ amount: 10, type: 'credit' })]

  it('sums in cents, so decimals never drift', () => {
    expect(measureOf('spent', rows)).toBe(0.3)
    expect(measureOf('received', rows)).toBe(10)
    expect(measureOf('net', rows)).toBe(9.7)
    expect(measureOf('count', rows)).toBe(3)
    expect(measureOf('average', rows)).toBe(0.15)
    expect(measureOf('average', [])).toBe(0)
  })

  it('formats money and counts, and compacts big axis ticks', () => {
    expect(formatMeasure('spent', 1234.6)).toBe('1,235')
    expect(formatMeasure('count', 1234)).toBe('1,234')
    expect(compactNumber(9999)).toBe('9,999')
    expect(compactNumber(12_345)).toBe('12.3K')
  })

  it('compares against a previous value, but not against nothing', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(-50, -100)).toBe(50)
    expect(percentChange(5, 0)).toBeNull()
  })
})

describe('colors', () => {
  it('ranks entities by the money through them, ties by name', () => {
    const ranks = entityRanks([
      row({ amount: 5, category: 'Dining', merchant: 'B' }),
      row({ amount: 5, category: 'Rent', merchant: 'A' }),
      row({ amount: 20, category: 'Groceries', merchant: null, account: 'checking' }),
    ])
    expect([...ranks.category]).toEqual([['Groceries', 0], ['Dining', 1], ['Rent', 2]]) // prettier-ignore
    expect([...ranks.merchant]).toEqual([['(unknown)', 0], ['A', 1], ['B', 2]]) // prettier-ignore
    expect([...ranks.account]).toEqual([['checking', 0], ['card', 1]]) // prettier-ignore
  })

  it('gives each key its ranked slot, fills the gaps in order, and keeps Other neutral', () => {
    const rank = new Map([['a', 2], ['b', 0], ['c', 2], ['z', 9]]) // prettier-ignore
    const swatches = assignSwatches(['a', 'b', 'c', 'z', 'new', OTHER_KEY], rank)
    expect(Object.fromEntries(swatches)).toEqual({
      a: 'chart-3',
      b: 'chart-1',
      c: 'chart-2', // its slot was taken
      z: 'chart-4', // ranked past the palette
      new: 'chart-5',
      [OTHER_KEY]: 'chart-other',
    })
  })

  it('runs out of slots into the neutral, which only a table ever shows', () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    expect(assignSwatches(keys).get('9')).toBe('chart-other')
  })
})

describe('drillInto', () => {
  it('leads from a category, merchant or account into the next question', () => {
    expect(drillInto('category', 'Dining')).toEqual({ category: 'Dining', by: 'merchant' })
    expect(drillInto('merchant', 'CITY CAFE')).toEqual({ merchant: 'CITY CAFE', by: 'month' })
    expect(drillInto('account', 'card')).toEqual({ account: 'card', by: 'category' })
  })

  it('goes nowhere from a period, the Other bucket or an unknown merchant', () => {
    expect(drillInto('month', '2026-01')).toBeNull()
    expect(drillInto('category', OTHER_KEY)).toBeNull()
    expect(drillInto('merchant', '(unknown)')).toBeNull()
  })
})

describe('buildChart', () => {
  it('ranks a single series by value, leaving out rows the measure ignores', () => {
    const rows = [
      row({ amount: 100, category: 'Dining' }),
      row({ amount: 300, category: 'Groceries' }),
      row({ amount: 900, type: 'credit', category: 'Salary' }),
    ]
    const chart = buildChart(rows, view(), ctx())
    expect(chart.total).toBe(400)
    expect(chart.series).toEqual([{ key: 'value', label: 'Spending', swatch: 'chart-1', total: 400 }])
    expect(chart.points.map((p) => [p.key, p.label, p.values.value, p.drill])).toEqual([
      ['Groceries', 'Groceries', 300, true],
      ['Dining', 'Dining', 100, true],
    ])
  })

  it('folds what is past the limit into Other, unless that is a single key', () => {
    const rows = 'ABCDEFGH'.split('').map((c, i) => row({ amount: 100 - i, merchant: c }))
    const pie = buildChart(rows, view({ by: 'merchant', chart: 'pie' }), ctx())
    expect(pie.points.map((p) => p.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', OTHER_KEY])
    expect(pie.points.at(-1)).toMatchObject({ label: 'Other', title: 'Other', total: 93 + 94, drill: false, swatch: 'chart-other' }) // prettier-ignore
    expect(buildChart(rows.slice(0, 7), view({ by: 'merchant', chart: 'pie' }), ctx()).points).toHaveLength(7)
    expect(buildChart(rows, view({ by: 'merchant', chart: 'table' }), ctx()).points).toHaveLength(8)
  })

  it('shows cash flow as income and spending, totalled as the net', () => {
    const rows = [row({ amount: 100 }), row({ amount: 1000, type: 'credit' })]
    const chart = buildChart(rows, view({ measure: 'flow', by: 'account' }), ctx())
    expect(chart.total).toBe(900)
    expect(chart.series.map((s) => [s.key, s.label, s.swatch, s.total])).toEqual([
      ['received', 'Income', 'positive', 1000],
      ['spent', 'Spending', 'negative', 100],
    ])
    expect(chart.points).toMatchObject([{ key: 'card', label: '#card', values: { received: 1000, spent: 100 }, total: 1100 }]) // prettier-ignore
  })

  it('splits into the biggest series and folds the rest into Other', () => {
    const rows = 'ABCDEFGH'.split('').map((c, i) => row({ amount: 10 * (8 - i), account: c, category: 'X' }))
    const chart = buildChart(rows, view({ by: 'category', split: 'account', chart: 'bar' }), ctx())
    expect(chart.series.map((s) => [s.label, s.total])).toEqual([
      ['#A', 80],
      ['#B', 70],
      ['#C', 60],
      ['#D', 50],
      ['#E', 40],
      ['#F', 30],
      ['Other', 30], // prettier-ignore
    ])
    expect(chart.points[0].values['s:__other']).toBe(30)
    expect(chart.points[0].total).toBe(360)
  })

  it('lays months out in full, empty ones as zero, with the year once they span two', () => {
    const rows = [row({ amount: 50, transactedAt: '2026-01-05T12:00:00.000Z' })]
    const chart = buildChart(rows, view({ by: 'month' }), ctx({ months: ['2025-12', '2026-01'] }))
    expect(chart.points.map((p) => [p.label, p.title, p.total, p.drill])).toEqual([
      ['Dec 25', 'December 2025', 0, false],
      ['Jan 26', 'January 2026', 50, false],
    ])
    expect(buildChart(rows, view({ by: 'month' }), ctx()).points[0].label).toBe('Jan')
  })

  it('runs weeks from Monday and days up to today, no further', () => {
    const rows = [row({ amount: 20, transactedAt: '2026-01-07T12:00:00.000Z' })]
    const weeks = buildChart(rows, view({ by: 'week' }), ctx({ today: new Date(2026, 0, 13) }))
    expect(weeks.points.map((p) => [p.key, p.label, p.total])).toEqual([
      ['2025-12-29', 'Dec 29', 0],
      ['2026-01-05', 'Jan 5', 20],
      ['2026-01-12', 'Jan 12', 0],
    ])
    expect(weeks.points[1].title).toBe('Week of Jan 5, 2026')

    const days = buildChart(rows, view({ by: 'day' }), ctx({ today: new Date(2026, 0, 8) }))
    expect(days.points.map((p) => p.key)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']) // prettier-ignore
    expect(days.points[6]).toMatchObject({ label: 'Jan 7', title: 'Wed, Jan 7, 2026', total: 20 })
    // A finished month runs to its last day, whenever today is.
    expect(buildChart(rows, view({ by: 'day' }), ctx({ today: new Date(2026, 5, 1) })).points).toHaveLength(31)
    expect(buildChart(rows, view({ by: 'day' }), ctx({ today: undefined })).points).toHaveLength(31)
  })

  it('lays the weekdays out Monday first', () => {
    const rows = [row({ amount: 5, transactedAt: '2026-01-11T12:00:00.000Z' })] // a Sunday
    const chart = buildChart(rows, view({ by: 'weekday' }), ctx())
    expect(chart.points.map((p) => p.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(chart.points[6]).toMatchObject({ title: 'Sunday', total: 5 })
  })

  it('colors points by rank where they are entities', () => {
    const rows = [row({ amount: 5, category: 'Dining' }), row({ amount: 9, category: 'Rent' })]
    const ranks = { ...NO_RANKS, category: new Map([['Dining', 0], ['Rent', 1]]) } // prettier-ignore
    const chart = buildChart(rows, view(), ctx({ ranks }))
    expect(chart.points.map((p) => [p.key, p.swatch])).toEqual([['Rent', 'chart-2'], ['Dining', 'chart-1']]) // prettier-ignore
  })
})

describe('summarize', () => {
  it('totals the period and its months', () => {
    const rows = [
      row({ amount: 100 }),
      row({ amount: 1000, type: 'credit' }),
      row({ amount: 300, transactedAt: '2026-02-03T12:00:00.000Z' }),
    ]
    expect(summarize(rows, ['2026-01', '2026-02'])).toEqual({
      spent: 400,
      received: 1000,
      net: 600,
      savingsRate: 60,
      monthly: { spent: [100, 300], received: [1000, 0], net: [900, -300] },
    })
  })

  it('has no savings rate without income', () => {
    expect(summarize([row({ amount: 1 })], ['2026-01']).savingsRate).toBeNull()
  })
})

describe('categoryTrends', () => {
  const rows = [
    row({ amount: 100, transactedAt: '2026-01-05T12:00:00.000Z' }),
    row({ amount: 300, transactedAt: '2026-01-25T12:00:00.000Z' }),
    row({ amount: 50, transactedAt: '2026-02-03T12:00:00.000Z' }),
    row({ amount: 70, transactedAt: '2026-02-04T12:00:00.000Z', category: 'Dining' }),
    row({ amount: 999, type: 'credit', transactedAt: '2026-02-04T12:00:00.000Z' }),
  ]

  it('gives each category its months, biggest first, against what is usual by this day', () => {
    expect(categoryTrends(rows, ['2026-01', '2026-02'], 10)).toEqual([
      { category: 'Groceries', total: 450, monthly: [400, 50], average: 225, latest: 50, usual: 100 },
      { category: 'Dining', total: 70, monthly: [0, 70], average: 35, latest: 70, usual: 0 },
    ])
  })

  it('has nothing usual to compare a lone month with', () => {
    expect(categoryTrends(rows, ['2026-02'], 31).map((t) => t.usual)).toEqual([null, null])
  })

  it('orders ties by name', () => {
    const tied = [row({ amount: 5, category: 'B' }), row({ amount: 5, category: 'A' })]
    expect(categoryTrends(tied, ['2026-01'], 31).map((t) => t.category)).toEqual(['A', 'B'])
  })
})
