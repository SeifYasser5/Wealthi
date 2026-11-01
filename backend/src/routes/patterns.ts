import { Router, Request, Response } from 'express'
import type { LearnResponse, PatternsResponse } from '@wealthi/shared'
import { listPatterns, setPatternStatus } from '../db/patterns'
import { runLearn } from '../services/run-learn'
import { parsePatternStatusUpdate } from '../validation/patterns'
import { route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/patterns
 * Every learned pattern: pending review, enabled, disabled.
 */
router.get(
  '/',
  route('failed to list patterns', async (_req: Request, res: Response) => {
    const response: PatternsResponse = { patterns: await listPatterns() }
    res.json(response)
  }),
)

/**
 * POST /api/patterns/learn
 * Learns patterns from chat.db and responds once it has finished. New ones are
 * stored pending; GET /api/patterns lists them. A failure is a 500 carrying the
 * reason, like POST /api/import.
 */
router.post('/learn', async (_req: Request, res: Response) => {
  try {
    const response: LearnResponse = await runLearn()
    res.json(response)
  } catch (err) {
    res.status(500).json({ error: `learn failed: ${err instanceof Error ? err.message : String(err)}` })
  }
})

/**
 * PATCH /api/patterns
 * Body: { "enable": ["<id>", …], "disable": ["<id>", …] } — either may be left out.
 * All or nothing: an unknown id is a 404 and changes nothing. Responds with
 * every pattern, as GET does.
 */
router.patch(
  '/',
  route('failed to update patterns', async (req: Request, res: Response) => {
    const parsed = parsePatternStatusUpdate(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const unknown = await setPatternStatus(parsed.value.enable, parsed.value.disable)
    if (unknown.length > 0) return res.status(404).json({ error: `unknown pattern ids: ${unknown.join(', ')}` })
    const response: PatternsResponse = { patterns: await listPatterns() }
    res.json(response)
  }),
)

export default router
