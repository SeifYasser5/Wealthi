import { Router, Request, Response } from 'express'
import { SPENDING_CATEGORIES, UNCATEGORIZED } from '../utils/categories'

const router = Router()

export interface CategoriesResponse {
  /** Assignable categories, alphabetically ordered — the exact set PATCH accepts. */
  categories: string[]
  /** Label the spending breakdown uses for rows with no category; not assignable. */
  uncategorized: string
}

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
