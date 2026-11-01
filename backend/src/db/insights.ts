import { prisma } from './client'
import type { Currency, InsightTransaction, TransactionType } from '../utils/types'
import { decimalToMinor } from '../utils/money'

/**
 * Every non-transfer transaction, oldest first — the raw input to the Insights
 * page. Like the spending breakdown, categories are resolved in
 * services/insights.ts by resolveCategory(), not here.
 */
export async function getInsightTransactions(): Promise<InsightTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: { counterAccount: null },
    select: {
      id: true,
      yearMonth: true,
      transactedAt: true,
      type: true,
      amount: true,
      currency: true,
      account: true,
      merchant: true,
      category: { select: { name: true } },
    },
    orderBy: { transactedAt: 'asc' },
  })

  return rows.map((r) => ({
    id: r.id,
    yearMonth: r.yearMonth,
    transactedAt: r.transactedAt,
    type: r.type as TransactionType,
    amount: decimalToMinor(r.amount),
    currency: r.currency as Currency,
    account: r.account,
    merchant: r.merchant,
    category: r.category?.name ?? null,
  }))
}
