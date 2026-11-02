import { Router, Request, Response } from 'express'
import type { BankSendersResponse } from '@wealthi/shared'
import { addBankSender, deleteBankSender, listBankSenders } from '../db/bank-senders'
import { parseBankSenderRequest, parseSenderParam } from '../validation/settings'
import { isRefusal, refuse, route } from '../utils/helpers'

const router = Router()

const senders = async (): Promise<BankSendersResponse> => ({ bankSenders: await listBankSenders() })

/**
 * GET /api/bank-senders
 * The chat.db handles SMS are imported and learned from, by name.
 */
router.get(
  '/',
  route('failed to list bank senders', async (_req: Request, res: Response) => {
    res.json(await senders())
  }),
)

/**
 * POST /api/bank-senders
 * Body: { sender }. Answers with the full list.
 */
router.post(
  '/',
  route('failed to add bank sender', async (req: Request, res: Response) => {
    const parsed = parseBankSenderRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const refusal = await addBankSender(parsed.value)
    if (isRefusal(refusal)) return refuse(res, refusal)
    res.status(201).json(await senders())
  }),
)

/**
 * DELETE /api/bank-senders/:sender
 * 204 once removed. Its messages are no longer imported or learned from.
 */
router.delete(
  '/:sender',
  route('failed to delete bank sender', async (req: Request, res: Response) => {
    const sender = parseSenderParam(req.params.sender)
    if ('error' in sender) return res.status(400).json({ error: sender.error })

    const refusal = await deleteBankSender(sender.value)
    if (refusal) return refuse(res, refusal)
    res.status(204).end()
  }),
)

export default router
