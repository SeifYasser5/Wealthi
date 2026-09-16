import { prisma } from './client'

export interface SpendingTransaction {
  id: string
  merchant: string | null
  amount: number
  account: string
  /** Manual override; null means the merchant map decides. */
  category: string | null
  transactedAt: Date
}

/**
 * Every debit (non-transfer) transaction for the month — the raw input to the
 * spending breakdown.
 *
 * Rollups are done in the route rather than with a `groupBy` here because the
 * effective category of a row is `category ?? MERCHANT_CATEGORIES[merchant]`,
 * which SQL cannot express. A single month is a few hundred rows at most, so
 * grouping in JS costs nothing and keeps one resolution rule for all callers.
 */
export async function getSpendingTransactions(yearMonth: string): Promise<SpendingTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: { yearMonth, type: 'debit', counterAccount: null },
    select: { id: true, merchant: true, amount: true, account: true, category: true, transactedAt: true },
    orderBy: { amount: 'desc' },
  })

  return rows.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    amount: Number(r.amount),
    account: r.account,
    category: r.category,
    transactedAt: r.transactedAt,
  }))
}
