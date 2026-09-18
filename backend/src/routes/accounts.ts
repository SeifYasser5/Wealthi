import { Router, Request, Response } from 'express'
import { ACCOUNTS } from '../utils/config'
import type { AccountsResponse } from '@wealthi/shared'

const router = Router()

/**
 * GET /api/accounts
 * The configured account list, so the UI never hardcodes which accounts exist.
 */
router.get('/', (_req: Request, res: Response) => {
  const response: AccountsResponse = { accounts: ACCOUNTS }
  res.json(response)
})

export default router
