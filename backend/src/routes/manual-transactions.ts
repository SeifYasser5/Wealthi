import { Router, Request, Response } from 'express'
import { listAccounts } from '../db/accounts'
import type { ManualTransactionResponse, ManualTransactionsResponse } from '@wealthi/shared'
import {
  createManualTransaction,
  deleteManualTransaction,
  listManualTransactions,
  updateManualTransaction,
} from '../db/manual-transactions'
import { parseManualTransactionId, parseManualTransactionRequest } from '../validation/manual-transactions'
import { isRefusal, isYearMonth, refuse, route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/manual-transactions
 * Newest first. Optional ?yearMonth=YYYY-MM keeps only that month's.
 */
router.get(
  '/',
  route('failed to list manual transactions', async (req: Request, res: Response) => {
    const { yearMonth } = req.query
    if (yearMonth !== undefined && !isYearMonth(yearMonth)) {
      return res.status(400).json({ error: 'yearMonth must be in YYYY-MM format' })
    }
    const response: ManualTransactionsResponse = { manualTransactions: await listManualTransactions(yearMonth) }
    res.json(response)
  }),
)

/**
 * POST /api/manual-transactions
 * Body: a ManualTransactionRequest. The next import copies it into the ledger.
 */
router.post(
  '/',
  route('failed to create manual transaction', async (req: Request, res: Response) => {
    const parsed = parseManualTransactionRequest(req.body, await listAccounts())
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const manualTransaction = await createManualTransaction(parsed.value)
    if (isRefusal(manualTransaction)) return refuse(res, manualTransaction)
    const response: ManualTransactionResponse = { manualTransaction }
    res.status(201).json(response)
  }),
)

/**
 * PUT /api/manual-transactions/:id
 * Body: a ManualTransactionRequest, replacing the stored one. The next import
 * rewrites its ledger row.
 */
router.put(
  '/:id',
  route('failed to update manual transaction', async (req: Request, res: Response) => {
    const id = parseManualTransactionId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })
    const parsed = parseManualTransactionRequest(req.body, await listAccounts())
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const manualTransaction = await updateManualTransaction(id.value, parsed.value)
    if (isRefusal(manualTransaction)) return refuse(res, manualTransaction)
    const response: ManualTransactionResponse = { manualTransaction }
    res.json(response)
  }),
)

/**
 * DELETE /api/manual-transactions/:id
 * 204 once deleted. Its ledger row leaves at the next import.
 */
router.delete(
  '/:id',
  route('failed to delete manual transaction', async (req: Request, res: Response) => {
    const id = parseManualTransactionId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })

    const refusal = await deleteManualTransaction(id.value)
    if (refusal) return refuse(res, refusal)
    res.status(204).end()
  }),
)

export default router
