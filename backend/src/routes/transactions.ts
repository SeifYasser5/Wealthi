import { Router, Request, Response } from 'express'
import { queryTransactions } from '../db/transactions'
import { ALL_ACCOUNTS } from '../utils/constants'
import type { AccountId } from '../utils/types'

const router = Router()

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/

/**
 * GET /api/transactions
 * Optional filters: ?yearMonth=YYYY-MM&account=<id>&merchant=<substring>
 * Always sorted by transactedAt descending (nulls last).
 */
router.get('/', async (req: Request, res: Response) => {
  const { yearMonth, account, merchant } = req.query

  if (yearMonth !== undefined && (typeof yearMonth !== 'string' || !YEAR_MONTH_RE.test(yearMonth))) {
    return res.status(400).json({ error: 'yearMonth must be in YYYY-MM format' })
  }
  if (account !== undefined && (typeof account !== 'string' || !ALL_ACCOUNTS.includes(account as AccountId))) {
    return res.status(400).json({ error: `account must be one of: ${ALL_ACCOUNTS.join(', ')}` })
  }
  if (merchant !== undefined && typeof merchant !== 'string') {
    return res.status(400).json({ error: 'merchant must be a string' })
  }

  try {
    const transactions = await queryTransactions({
      yearMonth: yearMonth as string | undefined,
      account: account as AccountId | undefined,
      merchant: merchant as string | undefined,
    })
    res.json({ count: transactions.length, transactions })
  } catch {
    res.status(500).json({ error: 'failed to query transactions' })
  }
})

export default router
