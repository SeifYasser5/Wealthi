import { Router, Request, Response } from 'express'
import { findBalancesByMonth } from '../db/balances'

const router = Router()

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/

/**
 * GET /api/balances
 * Required filter: ?yearMonth=YYYY-MM
 * Returns the stored monthly balance snapshot for each account in that month.
 */
router.get('/', async (req: Request, res: Response) => {
  const { yearMonth } = req.query

  if (typeof yearMonth !== 'string' || !YEAR_MONTH_RE.test(yearMonth)) {
    return res.status(400).json({ error: 'yearMonth query param is required and must be in YYYY-MM format' })
  }

  try {
    const balances = await findBalancesByMonth(yearMonth)
    res.json({ yearMonth, count: balances.length, balances })
  } catch {
    res.status(500).json({ error: 'failed to query balances' })
  }
})

export default router
