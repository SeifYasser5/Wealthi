import {
  SWATCH_BG,
  assignSwatches,
  percentChange,
  type CategoryTrend,
  type Ranks,
  type Swatch,
} from '../../../utils/insights'
import { money } from '../../../utils/utils'
import { Delta } from './SummaryTiles'
import { Sparkline } from './Sparkline'

interface Props {
  trends: CategoryTrend[]
  ranks: Ranks
  /** Monthly budgets by category name; empty when the view's currency isn't the one budgets are kept in. */
  budgets: ReadonlyMap<string, number>
  months: number
  /** "This month" while the last month is the current one, else its name. */
  latestLabel: string
  onOpen: (category: string) => void
}

/**
 * Small multiples: one card per category with its month-by-month spending,
 * the latest month against what is usual by the same day, and its budget when it has one. A card
 * opens that category's months in the chart above.
 */
export function CategoryTrends({ trends, ranks, budgets, months, latestLabel, onOpen }: Props) {
  const swatches = assignSwatches(
    trends.map((t) => t.category),
    ranks.category,
  )

  return (
    <section aria-labelledby="category-trends">
      <div className="mb-3 flex items-baseline justify-between gap-4 px-1">
        <h2 id="category-trends" className="text-lg font-semibold tracking-tight text-foreground">
          Category trends
        </h2>
        <span className="text-xs text-muted">Monthly spending · pick one to explore</span>
      </div>
      {trends.length === 0 ? (
        <p className="rounded-3xl bg-surface py-12 text-center text-sm text-muted">No spending in this period.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trends.map((t) => (
            <li key={t.category}>
              <TrendCard
                trend={t}
                swatch={swatches.get(t.category)!}
                budget={budgets.get(t.category) ?? null}
                months={months}
                latestLabel={latestLabel}
                onOpen={() => onOpen(t.category)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TrendCard({
  trend,
  swatch,
  budget,
  months,
  latestLabel,
  onOpen,
}: {
  trend: CategoryTrend
  swatch: Swatch
  budget: number | null
  months: number
  latestLabel: string
  onOpen: () => void
}) {
  const { category, total, monthly, average, latest, usual } = trend
  const over = budget !== null && latest > budget
  const change = usual === null ? null : percentChange(latest, usual)

  return (
    <button
      type="button"
      aria-label={`Explore ${category}`}
      onClick={onOpen}
      className="flex h-full w-full flex-col rounded-3xl bg-surface p-5 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="flex w-full items-center gap-2.5">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-sm ${SWATCH_BG[swatch]}`} />
        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{category}</span>
        <span className="text-base font-semibold tabular-nums text-foreground">{money(total)}</span>
      </span>
      <span className="mt-0.5 block text-xs text-muted">
        {months > 1 ? `≈ ${money(average)} a month` : 'this month'}
      </span>
      {months > 1 && (
        <span className="mt-3 block w-full">
          <Sparkline values={monthly} swatch={swatch} height={44} />
        </span>
      )}
      <span className="mt-auto flex w-full items-center justify-between gap-2 pt-3 text-xs">
        <span className="text-subtle">
          {latestLabel} <span className="font-semibold tabular-nums text-foreground">{money(latest)}</span>
        </span>
        {change !== null && (
          <Delta value={change} upIsGood={false} title="Against the usual spending by this day of the month" />
        )}
      </span>
      {budget !== null && <BudgetBar category={category} spent={latest} budget={budget} over={over} />}
    </button>
  )
}

/** How much of the month's allowance the latest month has used; a zero budget is used up at once. */
function BudgetBar({
  category,
  spent,
  budget,
  over,
}: {
  category: string
  spent: number
  budget: number
  over: boolean
}) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 100
  return (
    <span className="mt-3 block w-full">
      <span
        role="progressbar"
        aria-label={`${category} budget used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
      >
        <span
          className={`block h-full rounded-full ${over ? 'bg-warning' : 'bg-primary'}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </span>
      <span className={`mt-1.5 block text-xs tabular-nums ${over ? 'text-warning' : 'text-muted'}`}>
        {over ? `${money(spent - budget)} over` : `${money(budget - spent)} left`} of {money(budget)} budget
      </span>
    </span>
  )
}
