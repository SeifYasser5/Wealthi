import { Router, Request, Response } from 'express'
import { getMerchantTotals, getTransactionsAbove } from '../db/spending'
import { MERCHANT_CATEGORIES } from '../utils/categories'
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

export interface SpendingResponse {
  yearMonth: string
  grandTotal: number
  categories: CategoryRow[]
  largeTransactions: LargeTransactionRow[]
}

/**
 * GET /api/spending?yearMonth=YYYY-MM
 * Returns debit (non-transfer) transactions for the month grouped by category
 * then by merchant, ordered by total descending within each level.
 */
router.get('/', async (req: Request, res: Response) => {
  const { yearMonth } = req.query

  if (!yearMonth || typeof yearMonth !== 'string' || !YEAR_MONTH_RE.test(yearMonth)) {
    return res.status(400).json({ error: 'yearMonth is required in YYYY-MM format' })
  }

  try {
    const merchantTotals = await getMerchantTotals(yearMonth)
    const grandTotal = round2(merchantTotals.reduce((sum, m) => sum + m.total, 0))

    // Surface uncategorized transactions that exceed the threshold as standalone line items
    const largeTransactions: LargeTransactionRow[] = []
    const deductByMerchant = new Map<string, number>()

    if (grandTotal > 0) {
      const minAmount = round2(grandTotal * LARGE_TX_THRESHOLD)
      const txRows = await getTransactionsAbove(yearMonth, minAmount)
      for (const tx of txRows) {
        const isUncategorized = !tx.merchant || !MERCHANT_CATEGORIES[tx.merchant]
        if (!isUncategorized) continue
        largeTransactions.push({
          id: tx.id,
          merchant: tx.merchant,
          amount: tx.amount,
          account: tx.account,
          pct: round2((tx.amount / grandTotal) * 100),
        })
        if (tx.merchant) {
          deductByMerchant.set(tx.merchant, round2((deductByMerchant.get(tx.merchant) ?? 0) + tx.amount))
        }
      }
    }

    // Build category map, subtracting amounts already shown as large transactions
    const categoryMap = new Map<string, { total: number; merchants: MerchantRow[] }>()

    for (const { merchant, total } of merchantTotals) {
      const adjustedTotal = round2(total - (deductByMerchant.get(merchant) ?? 0))
      if (adjustedTotal <= 0) continue

      const category = MERCHANT_CATEGORIES[merchant] ?? 'Uncategorized'
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { total: 0, merchants: [] })
      }
      const cat = categoryMap.get(category)!
      cat.total = round2(cat.total + adjustedTotal)
      cat.merchants.push({ merchant, total: adjustedTotal })
    }

    const categories: CategoryRow[] = Array.from(categoryMap.entries())
      .map(([category, { total, merchants }]) => ({ category, total, merchants }))
      .sort((a, b) => b.total - a.total)

    const response: SpendingResponse = { yearMonth, grandTotal, categories, largeTransactions }
    res.json(response)
  } catch {
    res.status(500).json({ error: 'failed to compute spending breakdown' })
  }
})

export default router
