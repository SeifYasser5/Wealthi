import { Router, Request, Response } from 'express'
import type { CategoriesResponse } from '@wealthi/shared'
import { SPENDING_CATEGORIES, UNCATEGORIZED } from '../utils/categories'

const router = Router()

/**
 * GET /api/categories
 * The category vocabulary, so the UI's dropdown and the PATCH validation can
 * never drift apart.
 */
router.get('/', (_req: Request, res: Response) => {
  const response: CategoriesResponse = {
    categories: SPENDING_CATEGORIES,
    uncategorized: UNCATEGORIZED,
  }
  res.json(response)
})

export default router
