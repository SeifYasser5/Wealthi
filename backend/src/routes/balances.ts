import { Router, Request, Response } from 'express'
import type { BalancesResponse } from '@wealthi/shared'
import { findBalancesByMonth } from '../db/balances'
import { isYearMonth, route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/balances
 * Required filter: ?yearMonth=YYYY-MM
 * Returns the stored monthly balance snapshot for each account in that month.
 */
router.get(
  '/',
  route('failed to query balances', async (req: Request, res: Response) => {
    const { yearMonth } = req.query
    if (!isYearMonth(yearMonth)) {
      return res.status(400).json({ error: 'yearMonth query param is required and must be in YYYY-MM format' })
    }

    const balances = await findBalancesByMonth(yearMonth)
    const response: BalancesResponse = { yearMonth, count: balances.length, balances }
    res.json(response)
  }),
)

export default router
