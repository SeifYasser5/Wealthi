import type { RecurringAccount, ScheduleSuggestion, ScheduleSuggestionsResponse } from '../utils/types'
import { minorToNumber, type Minor } from '../utils/money'
import { round2 } from '../utils/helpers'
import { firstDayOnOrAfter } from '../utils/helpers/schedule'
import { listRecurringCandidates, listScheduledMerchants, type RecurringCandidate } from '../db/schedules'

/** Fewest months with exactly one charge a merchant needs to be suggested. */
export const MIN_MONTHS = 3
/** The share of a merchant's months that must have exactly one charge. */
export const MIN_ONCE_SHARE = 0.75
/** How many merchants are suggested. */
export const MAX_SUGGESTIONS = 10

const monthOf = (day: string) => day.slice(0, 7)

/** The month after "YYYY-MM". */
function nextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Merchants charged once a month: per (merchant, direction, currency), at least
 * MIN_MONTHS months had exactly one transaction and those are at least
 * MIN_ONCE_SHARE of the months it appeared in. The one transaction may land in a
 * different account each month, and its amount may differ; both are reported,
 * not required to match. Merchants in `scheduled` are skipped. Longest-running
 * first, capped at MAX_SUGGESTIONS.
 */
export function suggestSchedules(
  candidates: RecurringCandidate[],
  scheduled: ReadonlySet<string>,
): ScheduleSuggestion[] {
  const groups = new Map<string, Map<string, RecurringCandidate[]>>()
  for (const c of candidates) {
    if (scheduled.has(c.merchant)) continue
    const key = JSON.stringify([c.merchant, c.type, c.currency])
    const months = groups.get(key) ?? new Map<string, RecurringCandidate[]>()
    const month = monthOf(c.day)
    months.set(month, [...(months.get(month) ?? []), c])
    groups.set(key, months)
  }

  const suggestions: ScheduleSuggestion[] = []
  for (const byMonth of groups.values()) {
    const once = [...byMonth.values()].filter((rows) => rows.length === 1).map((rows) => rows[0])
    if (once.length < MIN_MONTHS || once.length / byMonth.size < MIN_ONCE_SHARE) continue

    const amounts = once.map((r) => r.amount)
    const min = Math.min(...amounts) as Minor
    const max = Math.max(...amounts) as Minor
    const average = Math.round(amounts.reduce((sum, a) => sum + a, 0) / amounts.length) as Minor
    const perAccount = new Map<string, number>()
    for (const r of once) perAccount.set(r.account, (perAccount.get(r.account) ?? 0) + 1)
    const accounts: RecurringAccount[] = [...perAccount.entries()]
      .map(([account, count]) => ({ account, count }))
      .sort((a, b) => b.count - a.count || a.account.localeCompare(b.account))

    const last = once.reduce((a, b) => (b.day > a.day ? b : a))
    const { merchant, type, currency } = last
    suggestions.push({
      merchant,
      type,
      currency,
      months: once.length,
      accounts,
      min: minorToNumber(min),
      max: minorToNumber(max),
      average: minorToNumber(average),
      spread: round2(((max - min) / average) * 100),
      lastDate: last.day,
      nextDate: firstDayOnOrAfter(nextMonth(monthOf(last.day)), Number(last.day.slice(8))),
    })
  }

  return suggestions
    .sort((a, b) => b.months - a.months || a.merchant.localeCompare(b.merchant))
    .slice(0, MAX_SUGGESTIONS)
}

/** The suggestions over the stored ledger. */
export async function scheduleSuggestions(): Promise<ScheduleSuggestionsResponse> {
  const [candidates, scheduled] = await Promise.all([listRecurringCandidates(), listScheduledMerchants()])
  return { suggestions: suggestSchedules(candidates, scheduled), minMonths: MIN_MONTHS }
}
