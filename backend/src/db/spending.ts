import { prisma } from './client'

export interface MerchantTotal {
  merchant: string
  total: number
}

/** Returns debit (non-transfer) totals grouped by merchant for the given month, sorted by total desc. */
export async function getMerchantTotals(yearMonth: string): Promise<MerchantTotal[]> {
  const groups = await prisma.transaction.groupBy({
    by: ['merchant'],
    where: {
      yearMonth,
      type: 'debit',
      counterAccount: null,
      merchant: { not: null },
    },
    _sum: { amount: true },
  })

  return groups
    .filter((g) => g.merchant !== null)
    .map((g) => ({
      merchant: g.merchant as string,
      total: Number(g._sum.amount ?? 0),
    }))
    .sort((a, b) => b.total - a.total)
}

export interface LargeTransaction {
  id: string
  merchant: string | null
  amount: number
  account: string
}

/** Returns individual debit (non-transfer) transactions whose amount >= minAmount. */
export async function getTransactionsAbove(
  yearMonth: string,
  minAmount: number,
): Promise<LargeTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      yearMonth,
      type: 'debit',
      counterAccount: null,
      amount: { gte: minAmount },
    },
    select: { id: true, merchant: true, amount: true, account: true },
    orderBy: { amount: 'desc' },
  })

  return rows.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    amount: Number(r.amount),
    account: r.account,
  }))
}
