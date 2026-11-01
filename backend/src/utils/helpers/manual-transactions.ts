/**
 * Transactions that never appear in bank SMS messages.
 *
 * Entries live in config/wealthi.json (manualTransactions) — add one for each
 * bank fee, reversed transaction, or manual adjustment you need to include in
 * reconciliation. The pipeline merges these with parsed SMS transactions before
 * computing balances. Repeating ones are schedules (db/schedules.ts) instead.
 *
 * Manual entries don't carry a bank-reported balance, so reportedBalance is null.
 */

import { config, type ManualEntry } from '../config'
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

export const manualTransactions: StagedTransaction[] = config.manualTransactions.map(toStaged)
