import { Router, Request, Response } from 'express'
import { setMerchantCategory } from '../db/categories'
import { parseMerchantCategory } from '../validation/categories'
import { refuse, route } from '../utils/helpers'
import { categoriesResponse } from './categories'

const router = Router()

/**
 * PUT /api/merchant-categories
 * Body: { "merchant": "ACME GROCERS", "categoryId": 2 } — maps the merchant,
 * moving it from any other category; { …, "categoryId": null } unmaps it.
 * Its transactions with no manual category follow. Responds with every
 * category, as GET /api/categories does.
 */
router.put(
  '/',
  route('failed to update merchant category', async (req: Request, res: Response) => {
    const parsed = parseMerchantCategory(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const refusal = await setMerchantCategory(parsed.value.merchant, parsed.value.categoryId)
    if (refusal) return refuse(res, refusal)
    res.json(await categoriesResponse())
  }),
)

export default router
