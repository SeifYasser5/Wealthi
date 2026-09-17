import { Router, Request, Response } from 'express'
import { ACCOUNTS } from '../utils/accounts'
import type { Account } from '../utils/config'

const router = Router()

export interface AccountsResponse {
  /** Your accounts in display order, with the label and currency the UI shows. */
  accounts: Account[]
}

/**
 * GET /api/accounts
 * The configured account list, so the UI never hardcodes which accounts exist.
 */
router.get('/', (_req: Request, res: Response) => {
  const response: AccountsResponse = { accounts: ACCOUNTS }
  res.json(response)
})

export default router
