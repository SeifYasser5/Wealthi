import { Router, Request, Response } from 'express'
import { queryTransactions, updateCategory, type TransferFilter } from '../db/transactions'
import { isSpendingCategory, SPENDING_CATEGORIES } from '../utils/categories'
import { ALL_ACCOUNTS } from '../utils/constants'
import type { AccountId, TransactionType } from '../utils/types'

const router = Router()

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRANSFER_FILTERS: TransferFilter[] = ['only', 'exclude']
const TRANSACTION_TYPES: TransactionType[] = ['debit', 'credit']

/**
 * GET /api/transactions
 * Optional filters:
 *   ?yearMonth=YYYY-MM&account=<id>&merchant=<substring>
 *   &type=debit|credit              direction: money out / money in
 *   &transfer=only|exclude          internal transfers only / everything but
 *   &counterAccount=<id>            the other leg of the transfer (implies transfer=only)
 * Always sorted by transactedAt descending (nulls last).
 */
router.get('/', async (req: Request, res: Response) => {
  const { yearMonth, account, merchant, type, transfer, counterAccount } = req.query

  if (yearMonth !== undefined && (typeof yearMonth !== 'string' || !YEAR_MONTH_RE.test(yearMonth))) {
    return res.status(400).json({ error: 'yearMonth must be in YYYY-MM format' })
  }
  if (account !== undefined && (typeof account !== 'string' || !ALL_ACCOUNTS.includes(account as AccountId))) {
    return res.status(400).json({ error: `account must be one of: ${ALL_ACCOUNTS.join(', ')}` })
  }
  if (merchant !== undefined && typeof merchant !== 'string') {
    return res.status(400).json({ error: 'merchant must be a string' })
  }
  if (type !== undefined && (typeof type !== 'string' || !TRANSACTION_TYPES.includes(type as TransactionType))) {
    return res.status(400).json({ error: `type must be one of: ${TRANSACTION_TYPES.join(', ')}` })
  }
  if (
    transfer !== undefined &&
    (typeof transfer !== 'string' || !TRANSFER_FILTERS.includes(transfer as TransferFilter))
  ) {
    return res.status(400).json({ error: `transfer must be one of: ${TRANSFER_FILTERS.join(', ')}` })
  }
  if (
    counterAccount !== undefined &&
    (typeof counterAccount !== 'string' || !ALL_ACCOUNTS.includes(counterAccount as AccountId))
  ) {
    return res.status(400).json({ error: `counterAccount must be one of: ${ALL_ACCOUNTS.join(', ')}` })
  }
  // Asking for a counter account while excluding transfers can never match a row.
  if (counterAccount !== undefined && transfer === 'exclude') {
    return res.status(400).json({ error: 'counterAccount cannot be combined with transfer=exclude' })
  }

  try {
    const transactions = await queryTransactions({
      yearMonth: yearMonth as string | undefined,
      account: account as AccountId | undefined,
      merchant: merchant as string | undefined,
      type: type as TransactionType | undefined,
      transfer: transfer as TransferFilter | undefined,
      counterAccount: counterAccount as AccountId | undefined,
    })
    res.json({ count: transactions.length, transactions })
  } catch {
    res.status(500).json({ error: 'failed to query transactions' })
  }
})

/**
 * PATCH /api/transactions/:id/category
 * Body: { "category": "Food" }  — assign a category
 *       { "category": null }    — clear it, falling back to the merchant map
 *
 * `category` must be one of GET /api/categories; free-text values are rejected
 * so the spending breakdown can never accumulate near-duplicate labels.
 * Responds with the updated transaction.
 */
router.patch('/:id/category', async (req: Request, res: Response) => {
  // Express types route params as `string | string[]`; a plain `:id` is always
  // a single value, so anything else is malformed.
  const id = req.params.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'id must be a UUID' })
  }

  const body = req.body as { category?: unknown } | undefined
  if (!body || !('category' in body)) {
    return res.status(400).json({ error: 'category is required (use null to clear it)' })
  }

  const { category } = body
  if (category !== null && typeof category !== 'string') {
    return res.status(400).json({ error: 'category must be a string or null' })
  }

  // An empty/whitespace string is the same intent as null: no category.
  const trimmed = typeof category === 'string' ? category.trim() : null
  const next = trimmed === '' ? null : trimmed

  if (next !== null && !isSpendingCategory(next)) {
    return res.status(400).json({ error: `category must be null or one of: ${SPENDING_CATEGORIES.join(', ')}` })
  }

  try {
    const transaction = await updateCategory(id, next)
    if (!transaction) {
      return res.status(404).json({ error: 'transaction not found' })
    }
    res.json({ transaction })
  } catch {
    res.status(500).json({ error: 'failed to update transaction category' })
  }
})

export default router
