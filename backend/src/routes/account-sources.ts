import { Router, Request, Response } from 'express'
import type { AccountSourceResponse, AccountSourcesResponse } from '@wealthi/shared'
import { deleteAccountSource, listAccountSources, setAccountSource } from '../db/accounts'
import { parseAccountSourceRequest, parseSourceParam } from '../validation/settings'
import { isRefusal, refuse, route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/account-sources
 * Every source key ("<bank>:<last 4 digits>") with the account it lands on.
 */
router.get(
  '/',
  route('failed to list account sources', async (_req: Request, res: Response) => {
    const response: AccountSourcesResponse = { accountSources: await listAccountSources() }
    res.json(response)
  }),
)

/**
 * PUT /api/account-sources
 * Body: { source, account }. Maps the key, moving it if it was mapped elsewhere.
 */
router.put(
  '/',
  route('failed to save account source', async (req: Request, res: Response) => {
    const parsed = parseAccountSourceRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const accountSource = await setAccountSource(parsed.value.source, parsed.value.account)
    if (isRefusal(accountSource)) return refuse(res, accountSource)
    const response: AccountSourceResponse = { accountSource }
    res.json(response)
  }),
)

/**
 * DELETE /api/account-sources/:source
 * 204 once removed. Messages on it become parse errors until it is mapped again.
 */
router.delete(
  '/:source',
  route('failed to delete account source', async (req: Request, res: Response) => {
    const source = parseSourceParam(req.params.source)
    if ('error' in source) return res.status(400).json({ error: source.error })

    const refusal = await deleteAccountSource(source.value)
    if (refusal) return refuse(res, refusal)
    res.status(204).end()
  }),
)

export default router
