/**
 * Transactions that never appear in bank SMS messages.
 *
 * Entries live in config/wealthi.json (manualTransactions and
 * recurringTransactions) — add one for each bank fee, reversed transaction, or
 * manual adjustment you need to include in reconciliation. The pipeline merges
 * these with parsed SMS transactions before computing balances.
 *
 * Manual entries don't carry a bank-reported balance, so reportedBalance is null.
 */

import { config, type ManualEntry, type RecurringEntry } from '../config'
import { toYearMonth } from '.'
import { StagedTransaction } from '../types'

function toStaged({ date, ...entry }: ManualEntry): StagedTransaction {
  const transactedAt = new Date(date)
  return {
    ...entry,
    counterAccount: null,
    transactedAt,
    reportedBalance: null,
    yearMonth: toYearMonth(transactedAt),
  }
}

// Expands to one entry per month from startYearMonth (inclusive) through today.
function expandRecurring({ startYearMonth, dayOfMonth, ...entry }: RecurringEntry): ManualEntry[] {
  const [startYear, startMonth] = startYearMonth.split('-').map(Number)
  const now = new Date()
  const entries: ManualEntry[] = []
  let year = startYear
  let month = startMonth // 1-based
  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
    entries.push({ ...entry, date })
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }
  return entries
}

export const manualTransactions: StagedTransaction[] = [
  ...config.recurringTransactions.flatMap(expandRecurring),
  ...config.manualTransactions,
].map(toStaged)
