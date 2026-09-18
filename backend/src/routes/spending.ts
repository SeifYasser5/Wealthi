import { Router, Request, Response } from 'express'
import type { SpendingResponse } from '@wealthi/shared'
import { getSpendingBreakdown } from '../services/spending'
import { isYearMonth, route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/spending?yearMonth=YYYY-MM
 * The month's debit (non-transfer) spending grouped by category then merchant.
 * See `getSpendingBreakdown` in services/spending.ts for the rules.
 */
router.get(
  '/',
  route('failed to compute spending breakdown', async (req: Request, res: Response) => {
    const { yearMonth } = req.query
    if (!isYearMonth(yearMonth)) {
      return res.status(400).json({ error: 'yearMonth is required in YYYY-MM format' })
    }

    const response: SpendingResponse = await getSpendingBreakdown(yearMonth)
    res.json(response)
  }),
)

export default router
