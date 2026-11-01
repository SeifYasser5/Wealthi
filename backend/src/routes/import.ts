import { Router, Request, Response } from 'express'
import type { ImportResponse } from '@wealthi/shared'
import { runImport } from '../services/run-import'

const router = Router()

/**
 * POST /api/import
 * Rebuilds the ledger from chat.db and responds once it has finished, with the
 * report of what was read, stored and rejected. A failure is a 500 carrying the
 * reason, since that is what you need to fix before running it again.
 */
router.post('/', async (_req: Request, res: Response) => {
  try {
    const response: ImportResponse = await runImport()
    res.json(response)
  } catch (err) {
    res.status(500).json({ error: `import failed: ${err instanceof Error ? err.message : String(err)}` })
  }
})

export default router
