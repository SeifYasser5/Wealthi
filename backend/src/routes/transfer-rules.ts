import { Router, Request, Response } from 'express'
import type { TransferRuleResponse, TransferRulesResponse } from '@wealthi/shared'
import { createTransferRule, deleteTransferRule, listTransferRules, updateTransferRule } from '../db/transfer-rules'
import { parseTransferRuleId, parseTransferRuleRequest } from '../validation/settings'
import { isRefusal, refuse, route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/transfer-rules
 * Every rule, in the order the import tries them: a merchant first, then the catch-alls.
 */
router.get(
  '/',
  route('failed to list transfer rules', async (_req: Request, res: Response) => {
    const response: TransferRulesResponse = { transferRules: await listTransferRules() }
    res.json(response)
  }),
)

/**
 * POST /api/transfer-rules
 * Body: a TransferRuleRequest. The next import tags the matching legs.
 */
router.post(
  '/',
  route('failed to create transfer rule', async (req: Request, res: Response) => {
    const parsed = parseTransferRuleRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const transferRule = await createTransferRule(parsed.value)
    if (isRefusal(transferRule)) return refuse(res, transferRule)
    const response: TransferRuleResponse = { transferRule }
    res.status(201).json(response)
  }),
)

/**
 * PUT /api/transfer-rules/:id
 * Body: a TransferRuleRequest, replacing the stored one.
 */
router.put(
  '/:id',
  route('failed to update transfer rule', async (req: Request, res: Response) => {
    const id = parseTransferRuleId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })
    const parsed = parseTransferRuleRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const transferRule = await updateTransferRule(id.value, parsed.value)
    if (isRefusal(transferRule)) return refuse(res, transferRule)
    const response: TransferRuleResponse = { transferRule }
    res.json(response)
  }),
)

/**
 * DELETE /api/transfer-rules/:id
 * 204 once deleted. Its transfers lose their tag at the next import.
 */
router.delete(
  '/:id',
  route('failed to delete transfer rule', async (req: Request, res: Response) => {
    const id = parseTransferRuleId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })

    const refusal = await deleteTransferRule(id.value)
    if (refusal) return refuse(res, refusal)
    res.status(204).end()
  }),
)

export default router
