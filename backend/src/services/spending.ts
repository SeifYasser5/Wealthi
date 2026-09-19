import type { CategoryRow, LargeTransactionRow, SpendingResponse, UncategorizedTransactionRow } from '@wealthi/shared'
import { getSpendingTransactions } from '../db/spending'
import type { SpendingTransaction } from '../utils/types'
import { resolveCategory, UNCATEGORIZED, UNKNOWN_MERCHANT } from '../utils/categories'
import { round2 } from '../utils/helpers'
import { minorToNumber, type Minor } from '../utils/money'

/** Percent of the month's spending at which an uncategorized charge gets its own line item. */
const LARGE_TX_PERCENT = 5

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
  // Totals are summed in minor units and become numbers only in the response.
  const grandTotal = txs.reduce((sum, tx) => sum + tx.amount, 0) as Minor
  // A ratio, not money: the minor-unit scale cancels out.
  const pctOf = (amount: Minor) => (grandTotal > 0 ? round2((amount / grandTotal) * 100) : 0)

  // An uncategorized charge this big would otherwise disappear into the
  // Uncategorized bucket, so it gets its own line item instead. The threshold
  // is LARGE_TX_PERCENT of the total, rounded half up to a minor unit.
  const minLargeAmount = grandTotal > 0 ? Math.floor((grandTotal * LARGE_TX_PERCENT + 50) / 100) : Infinity

  const largeTransactions: LargeTransactionRow[] = []
  const uncategorized: UncategorizedTransactionRow[] = []
  const categoryMap = new Map<string, { total: Minor; merchants: Map<string, Minor> }>()

  for (const tx of txs) {
    const category = resolveCategory(tx.merchant, tx.category)

    if (category === UNCATEGORIZED) {
      // Promoted rows are shown as their own card, so they are listed once —
      // there and not in `uncategorized` — and both carry the same id.
      if (tx.amount >= minLargeAmount) {
        largeTransactions.push({
          id: tx.id,
          merchant: tx.merchant,
          amount: minorToNumber(tx.amount),
          account: tx.account,
          pct: pctOf(tx.amount),
        })
        continue
      }
      uncategorized.push({
        id: tx.id,
        merchant: tx.merchant,
        amount: minorToNumber(tx.amount),
        account: tx.account,
        transactedAt: tx.transactedAt.toISOString(),
        pct: pctOf(tx.amount),
      })
    }

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { total: 0 as Minor, merchants: new Map() })
    }
    const bucket = categoryMap.get(category)!
    bucket.total = (bucket.total + tx.amount) as Minor

    const merchant = tx.merchant ?? UNKNOWN_MERCHANT
    bucket.merchants.set(merchant, ((bucket.merchants.get(merchant) ?? 0) + tx.amount) as Minor)
  }

  const categories: CategoryRow[] = Array.from(categoryMap.entries())
    .map(([category, { total, merchants }]) => ({
      category,
      total: minorToNumber(total),
      merchants: Array.from(merchants.entries())
        .map(([merchant, merchantTotal]) => ({ merchant, total: minorToNumber(merchantTotal) }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)

  return { yearMonth, grandTotal: minorToNumber(grandTotal), categories, largeTransactions, uncategorized }
}
