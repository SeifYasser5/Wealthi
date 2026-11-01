import { prisma } from './client'
import type { SpendingTransaction } from '../utils/types'
import { decimalToMinor } from '../utils/money'

/**
 * Every debit (non-transfer) transaction for the month — the raw input to the
 * spending breakdown.
 *
 * Rollups are done in services/spending.ts rather than with a `groupBy` here, so
 * the effective category of a row (manual category, else merchant map) is
 * decided by resolveCategory() alone. A single month is a few hundred rows at
 * most, so grouping in JS costs nothing and keeps one resolution rule for all callers.
 */
export async function getSpendingTransactions(yearMonth: string): Promise<SpendingTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: { yearMonth, type: 'debit', counterAccount: null },
    select: {
      id: true,
      merchant: true,
      amount: true,
      account: true,
      category: { select: { name: true } },
      transactedAt: true,
    },
    orderBy: { amount: 'desc' },
  })

  return rows.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    amount: decimalToMinor(r.amount),
    account: r.account,
    category: r.category?.name ?? null,
    transactedAt: r.transactedAt,
  }))
}
