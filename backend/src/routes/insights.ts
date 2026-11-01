import { Router, Request, Response } from 'express'
import type { InsightsResponse } from '@wealthi/shared'
import { getInsights } from '../services/insights'
import { route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/insights
 * Every non-transfer transaction with its resolved category, oldest first.
 * The Insights page groups and sums them itself; see services/insights.ts.
 */
router.get(
  '/',
  route('failed to load insights', async (_req: Request, res: Response) => {
    const response: InsightsResponse = await getInsights()
    res.json(response)
  }),
)

export default router
