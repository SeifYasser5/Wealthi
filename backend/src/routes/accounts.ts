import { Router, Request, Response } from 'express'
import type { AccountResponse, AccountsResponse } from '@wealthi/shared'
import { createAccount, deleteAccount, listAccounts, updateAccount } from '../db/accounts'
import { parseAccountRequest, parseAccountUpdate } from '../validation/settings'
import { isRefusal, refuse, route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/accounts
 * Your accounts in display order, so the UI never hardcodes which accounts exist.
 */
router.get(
  '/',
  route('failed to list accounts', async (_req: Request, res: Response) => {
    const response: AccountsResponse = { accounts: await listAccounts() }
    res.json(response)
  }),
)

/**
 * POST /api/accounts
 * Body: an AccountRequest. The opening balance reaches the balances at the next import.
 */
router.post(
  '/',
  route('failed to create account', async (req: Request, res: Response) => {
    const parsed = parseAccountRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const account = await createAccount(parsed.value)
    if (isRefusal(account)) return refuse(res, account)
    const response: AccountResponse = { account }
    res.status(201).json(response)
  }),
)

/**
 * PUT /api/accounts/:id
 * Body: an AccountUpdateRequest. The id and the currency can't change.
 */
router.put(
  '/:id',
  route('failed to update account', async (req: Request, res: Response) => {
    const parsed = parseAccountUpdate(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const account = await updateAccount(String(req.params.id), parsed.value)
    if (isRefusal(account)) return refuse(res, account)
    const response: AccountResponse = { account }
    res.json(response)
  }),
)

/**
 * DELETE /api/accounts/:id
 * 204 once deleted; 409 with what still uses it otherwise.
 */
router.delete(
  '/:id',
  route('failed to delete account', async (req: Request, res: Response) => {
    const refusal = await deleteAccount(String(req.params.id))
    if (refusal) return refuse(res, refusal)
    res.status(204).end()
  }),
)

export default router
