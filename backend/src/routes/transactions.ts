import { Router, Request, Response } from 'express'
import { queryTransactions, updateCategory } from '../db/transactions'
import { parseCategoryUpdate, parseTransactionFilters } from '../validation/transactions'
import { route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/transactions
 * Optional filters:
 *   ?yearMonth=YYYY-MM&account=<id>&merchant=<substring>
 *   &type=debit|credit              direction: money out / money in
 *   &transfer=only|exclude          internal transfers only / everything but
 *   &counterAccount=<id>            the other leg of the transfer (implies transfer=only)
 * Always sorted by transactedAt descending (nulls last).
 */
router.get(
  '/',
  route('failed to query transactions', async (req: Request, res: Response) => {
    const parsed = parseTransactionFilters(req.query)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const transactions = await queryTransactions(parsed.value)
    res.json({ count: transactions.length, transactions })
  }),
)

/**
 * PATCH /api/transactions/:id/category
 * Body: { "category": "Food" }  — assign a category
 *       { "category": null }    — clear it, falling back to the merchant map
 *
 * `category` must be one of GET /api/categories; free-text values are rejected
 * so the spending breakdown can never accumulate near-duplicate labels.
 * Responds with the updated transaction.
 */
router.patch(
  '/:id/category',
  route('failed to update transaction category', async (req: Request, res: Response) => {
    const parsed = parseCategoryUpdate(req.params.id, req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const transaction = await updateCategory(parsed.value.id, parsed.value.category)
    if (!transaction) return res.status(404).json({ error: 'transaction not found' })
    res.json({ transaction })
  }),
)

export default router
