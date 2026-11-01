import { Router, Request, Response } from 'express'
import type { CategoriesResponse, CategoryResponse, CategorySuggestionsResponse } from '@wealthi/shared'
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  reorderCategories,
  setCategoryBudget,
} from '../db/categories'
import { parseBudget, parseCategoryId, parseCategoryRequest, parseReorder } from '../validation/categories'
import { categorySuggestions } from '../services/category-suggestions'
import { UNCATEGORIZED } from '../utils/categories'
import { isRefusal, refuse, route } from '../utils/helpers'

const router = Router()

/** Every category in order: what GET answers, and a reorder or merchant mapping too. */
export async function categoriesResponse(): Promise<CategoriesResponse> {
  return { categories: await listCategories(), uncategorized: UNCATEGORIZED }
}

/**
 * GET /api/categories
 * Every category in order, with its transaction count and merchants — the
 * Categories page, and the list every category dropdown offers.
 */
router.get(
  '/',
  route('failed to list categories', async (_req: Request, res: Response) => {
    res.json(await categoriesResponse())
  }),
)

/**
 * GET /api/categories/suggestions
 * The ten merchants with the most debits (at least five, none already mapped
 * to a category), each with the amounts it repeated at least five times and a
 * count of the debits left over.
 */
router.get(
  '/suggestions',
  route('failed to suggest categories', async (_req: Request, res: Response) => {
    const response: CategorySuggestionsResponse = await categorySuggestions()
    res.json(response)
  }),
)

/**
 * POST /api/categories
 * Body: { "name": "Travel" } — added after every other category. A name taken
 * by another category, in any case, is a 409.
 */
router.post(
  '/',
  route('failed to create category', async (req: Request, res: Response) => {
    const parsed = parseCategoryRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const category = await createCategory(parsed.value.name)
    if (isRefusal(category)) return refuse(res, category)
    const response: CategoryResponse = { category }
    res.status(201).json(response)
  }),
)

/**
 * PUT /api/categories/order
 * Body: { "ids": [3, 1, 2] } — every category id, in the new order. A list
 * that leaves one out or names one that isn't stored is a 409.
 */
router.put(
  '/order',
  route('failed to reorder categories', async (req: Request, res: Response) => {
    const parsed = parseReorder(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const refusal = await reorderCategories(parsed.value.ids)
    if (refusal) return refuse(res, refusal)
    res.json(await categoriesResponse())
  }),
)

/**
 * PATCH /api/categories/:id
 * Body: { "name": "Eating out" } — renames it; its transactions and merchants follow.
 */
router.patch(
  '/:id',
  route('failed to rename category', async (req: Request, res: Response) => {
    const id = parseCategoryId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })
    const parsed = parseCategoryRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const category = await renameCategory(id.value, parsed.value.name)
    if (isRefusal(category)) return refuse(res, category)
    const response: CategoryResponse = { category }
    res.json(response)
  }),
)

/**
 * PUT /api/categories/:id/budget
 * Body: { "budget": 1500 } — the category's monthly allowance; null clears it.
 */
router.put(
  '/:id/budget',
  route('failed to set budget', async (req: Request, res: Response) => {
    const id = parseCategoryId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })
    const parsed = parseBudget(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const category = await setCategoryBudget(id.value, parsed.value.budget)
    if (isRefusal(category)) return refuse(res, category)
    const response: CategoryResponse = { category }
    res.json(response)
  }),
)

/**
 * DELETE /api/categories/:id
 * 204 once deleted. A category still assigned to a transaction or mapped from
 * a merchant is a 409 saying how many: move those first.
 */
router.delete(
  '/:id',
  route('failed to delete category', async (req: Request, res: Response) => {
    const id = parseCategoryId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })

    const refusal = await deleteCategory(id.value)
    if (refusal) return refuse(res, refusal)
    res.status(204).end()
  }),
)

export default router
