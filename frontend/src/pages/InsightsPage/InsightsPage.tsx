import { useMemo, useRef } from 'react'
import type { InsightRow } from '@wealthi/shared'
import { CategoryTrends } from './components/CategoryTrends'
import { ExploreCard } from './components/ExploreCard'
import { Shortcuts } from './components/Shortcuts'
import { SummaryTiles } from './components/SummaryTiles'
import { PageTitle } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { SegmentedControl } from '../../components/SegmentedControl'
import { Select } from '../../components/Select'
import { UpdatingIndicator } from '../../components/UpdatingIndicator'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { useInsights, useInsightsView } from '../../hooks/useInsights'
import {
  RANGES,
  buildChart,
  categoryTrends,
  currenciesByUse,
  describePeriod,
  drillInto,
  entityRanks,
  periodMonths,
  previousMonths,
  scopeRows,
  summarize,
  type View,
} from '../../utils/insights'
import { currentYearMonth, formatYearMonth } from '../../utils/utils'

const NO_ROWS: InsightRow[] = []

export function InsightsPage() {
  const query = useInsights()
  const rows = query.data?.rows ?? NO_ROWS
  const currencies = useMemo(() => currenciesByUse(rows), [rows])
  const { view, update } = useInsightsView(currencies)
  const { accounts, currency: currencyOf } = useAccounts()

  return (
    // From md up the page is exactly the viewport under the NavBar (h-16 plus its
    // 1px border): the period, filters and shortcuts stay put and the charts scroll.
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-4 md:flex md:h-[calc(100dvh-4rem-1px)] md:flex-col">
      <header className="mb-4 shrink-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <PageTitle>Insights</PageTitle>
            <UpdatingIndicator query={query} className="text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Picking an account moves to its currency, so the view never comes up empty. */}
            <Select
              label="Account"
              value={view.account}
              onChange={(account) => update({ account, ...(account && { currency: currencyOf(account) }) })}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
            {currencies.length > 1 && (
              <SegmentedControl
                label="Currency"
                value={view.currency}
                options={currencies.map((c) => ({ value: c, label: c }))}
                onChange={(currency) =>
                  update({
                    currency,
                    account: view.account && currencyOf(view.account) !== currency ? '' : view.account,
                  })
                }
              />
            )}
            <SegmentedControl
              label="Period"
              value={view.range}
              options={RANGES}
              onChange={(range) => update({ range })}
            />
          </div>
        </div>
        <Shortcuts view={view} onPick={update} />
      </header>

      <QueryState
        query={query}
        isEmpty={(data) => data.rows.length === 0}
        errorMessage="Failed to load insights"
        emptyMessage="No transactions yet. Run an import from the Dashboard to see insights."
      >
        {(data) => <Insights rows={data.rows} view={view} update={update} primaryCurrency={currencies[0]} />}
      </QueryState>
    </div>
  )
}

/** Everything under the header, over one slice of the ledger. */
function Insights({
  rows,
  view,
  update,
  primaryCurrency,
}: {
  rows: InsightRow[]
  view: View
  update: (patch: Partial<View>) => void
  /** The most used currency: budgets are kept in it. */
  primaryCurrency: string
}) {
  const { label } = useAccounts()
  const categories = useCategories()
  const exploreRef = useRef<HTMLElement>(null)

  const ranks = useMemo(() => entityRanks(rows), [rows])
  const months = useMemo(() => periodMonths(view.range, rows), [view.range, rows])
  const scoped = useMemo(() => scopeRows(rows, months, view), [rows, months, view])
  const chart = useMemo(
    () => buildChart(scoped, view, { months, ranks, accountLabel: label }),
    [scoped, view, months, ranks, label],
  )
  const summary = useMemo(() => {
    const previous = previousMonths(view.range, months)
    return {
      current: summarize(scoped, months),
      previous: previous && summarize(scopeRows(rows, previous, view), previous),
    }
  }, [rows, scoped, months, view])
  // Every category, whichever one the chart has drilled into.
  const live = months[months.length - 1] === currentYearMonth()
  const trends = useMemo(
    () => categoryTrends(scopeRows(rows, months, { ...view, category: '' }), months, live ? new Date().getDate() : 31),
    [rows, months, view, live],
  )
  const budgets = useMemo(() => {
    if (view.currency !== primaryCurrency) return new Map<string, number>()
    const list = categories.data?.categories ?? []
    return new Map(list.flatMap((c) => (c.budget === null ? [] : [[c.name, c.budget] as const])))
  }, [categories.data, view.currency, primaryCurrency])

  const period = describePeriod(months)

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
      <SummaryTiles current={summary.current} previous={summary.previous} period={period} months={months.length} />
      <ExploreCard
        ref={exploreRef}
        chart={chart}
        view={view}
        count={scoped.length}
        period={period}
        onChange={update}
        onDrill={(key) => update(drillInto(view.by, key)!)}
      />
      <CategoryTrends
        trends={trends}
        ranks={ranks}
        budgets={budgets}
        months={months.length}
        latestLabel={live ? 'This month' : formatYearMonth(months[months.length - 1]).split(' ')[0]}
        onOpen={(category) => {
          update({ category, measure: 'spent', by: 'month', split: 'none', chart: 'bar' })
          exploreRef.current!.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
      />
    </div>
  )
}
