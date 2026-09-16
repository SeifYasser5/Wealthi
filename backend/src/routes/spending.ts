import { Router, Request, Response } from 'express'
import { getSpendingTransactions } from '../db/spending'
import { resolveCategory, UNCATEGORIZED, UNKNOWN_MERCHANT } from '../utils/categories'
import { round2 } from '../utils/helpers'

const router = Router()
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/
const LARGE_TX_THRESHOLD = 0.05

export interface MerchantRow {
  merchant: string
  total: number
}

export interface CategoryRow {
  category: string
  total: number
  merchants: MerchantRow[]
}

export interface LargeTransactionRow {
  id: string
  merchant: string | null
  amount: number
  account: string
  pct: number
}

/** An uncategorized transaction, addressable by id so the UI can assign it a category. */
export interface UncategorizedTransactionRow {
  id: string
  merchant: string | null
  amount: number
  account: string
  transactedAt: string
  pct: number
}

export interface SpendingResponse {
  yearMonth: string
  grandTotal: number
  categories: CategoryRow[]
  largeTransactions: LargeTransactionRow[]
  uncategorized: UncategorizedTransactionRow[]
}

/**
 * GET /api/spending?yearMonth=YYYY-MM
 * Returns debit (non-transfer) transactions for the month grouped by category
 * then by merchant, ordered by total descending within each level.
 *
 * A transaction's category is its manual `category` when set, otherwise the
 * merchant map. Everything still unresolved is listed row-by-row under
 * `uncategorized` (or `largeTransactions`) so it can be assigned one.
 */
router.get('/', async (req: Request, res: Response) => {
  const { yearMonth } = req.query

  if (!yearMonth || typeof yearMonth !== 'string' || !YEAR_MONTH_RE.test(yearMonth)) {
    return res.status(400).json({ error: 'yearMonth is required in YYYY-MM format' })
  }

  try {
    const txs = await getSpendingTransactions(yearMonth)
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

    const response: SpendingResponse = {
      yearMonth,
      grandTotal,
      categories,
      largeTransactions,
      uncategorized,
    }
    res.json(response)
  } catch {
    res.status(500).json({ error: 'failed to compute spending breakdown' })
  }
})

export default router
