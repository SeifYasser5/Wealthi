/**
 * Transactions that never appear in bank SMS messages.
 *
 * They live in the manual_transactions table (db/manual-transactions.ts),
 * edited in Settings → Manual and seeded once from config's manualTransactions.
 * The import copies each into `transactions` and counts it in the balances,
 * so a rebuild never loses one. Repeating ones are schedules instead.
 *
 * Manual entries don't carry a bank-reported balance, so reportedBalance is null.
 */

import { toYearMonth } from '.'
import { localMidnight } from './schedule'
import type { StagedTransaction, StoredManualTransaction } from '../types'

export function stageManualTransactions(entries: StoredManualTransaction[]): StagedTransaction[] {
  return entries.map(({ id: _id, date, ...entry }) => {
    const transactedAt = localMidnight(date)
    return {
      ...entry,
      counterAccount: null,
      transactedAt,
      reportedBalance: null,
      yearMonth: toYearMonth(transactedAt),
    }
  })
}
