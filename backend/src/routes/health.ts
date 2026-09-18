import { Router, Request, Response } from 'express'
import { isDbConnected } from '../db/health'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  const connected = await isDbConnected()
  res
    .status(connected ? 200 : 503)
    .json({ status: 'ok', db: connected ? 'connected' : 'disconnected', timestamp: new Date().toISOString() })
})

export default router
