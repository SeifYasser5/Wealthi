import type { CategoryRow, LargeTransactionRow, SpendingResponse, UncategorizedTransactionRow } from '@wealthi/shared'
import { getSpendingTransactions } from '../db/spending'
import type { SpendingTransaction } from '../utils/types'
import { resolveCategory, UNCATEGORIZED, UNKNOWN_MERCHANT } from '../utils/categories'
import { round2 } from '../utils/helpers'

/** Share of the month's spending at which an uncategorized charge gets its own line item. */
const LARGE_TX_THRESHOLD = 0.05

/**
 * The month's debit (non-transfer) spending grouped by category then by
 * merchant, ordered by total descending within each level.
 *
 * A transaction's category is its manual `category` when set, otherwise the
 * merchant map. Everything still unresolved is listed row-by-row under
 * `uncategorized` (or `largeTransactions`) so it can be assigned one.
 */
export async function getSpendingBreakdown(yearMonth: string): Promise<SpendingResponse> {
  return buildSpendingBreakdown(yearMonth, await getSpendingTransactions(yearMonth))
}

export function buildSpendingBreakdown(yearMonth: string, txs: SpendingTransaction[]): SpendingResponse {
  const grandTotal = round2(txs.reduce((sum, tx) => sum + tx.amount, 0))
  const pctOf = (amount: number) => (grandTotal > 0 ? round2((amount / grandTotal) * 100) : 0)

  // An uncategorized charge this big would otherwise disappear into the
  // Uncategorized bucket, so it gets its own line item instead.
  const minLargeAmount = grandTotal > 0 ? round2(grandTotal * LARGE_TX_THRESHOLD) : Infinity

  const largeTransactions: LargeTransactionRow[] = []
  const uncategorized: UncategorizedTransactionRow[] = []
  const categoryMap = new Map<string, { total: number; merchants: Map<string, number> }>()

  for (const tx of txs) {
    const category = resolveCategory(tx.merchant, tx.category)

    if (category === UNCATEGORIZED) {
      // Promoted rows are shown as their own card, so they are listed once —
      // there and not in `uncategorized` — and both carry the same id.
      if (tx.amount >= minLargeAmount) {
        largeTransactions.push({
          id: tx.id,
          merchant: tx.merchant,
          amount: tx.amount,
          account: tx.account,
          pct: pctOf(tx.amount),
        })
        continue
      }
      uncategorized.push({
        id: tx.id,
        merchant: tx.merchant,
        amount: tx.amount,
        account: tx.account,
        transactedAt: tx.transactedAt.toISOString(),
        pct: pctOf(tx.amount),
      })
    }

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { total: 0, merchants: new Map() })
    }
    const bucket = categoryMap.get(category)!
    bucket.total = round2(bucket.total + tx.amount)

    const merchant = tx.merchant ?? UNKNOWN_MERCHANT
    bucket.merchants.set(merchant, round2((bucket.merchants.get(merchant) ?? 0) + tx.amount))
  }

  const categories: CategoryRow[] = Array.from(categoryMap.entries())
    .map(([category, { total, merchants }]) => ({
      category,
      total,
      merchants: Array.from(merchants.entries())
        .map(([merchant, merchantTotal]) => ({ merchant, total: merchantTotal }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)

  return { yearMonth, grandTotal, categories, largeTransactions, uncategorized }
}
