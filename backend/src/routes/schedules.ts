import { Router, Request, Response } from 'express'
import type { ScheduleResponse, SchedulesResponse, ScheduleSuggestionsResponse } from '@wealthi/shared'
import { createSchedule, deleteSchedule, listSchedules, updateSchedule } from '../db/schedules'
import { parseScheduleId, parseScheduleRequest } from '../validation/schedules'
import { scheduleSuggestions } from '../services/schedule-suggestions'
import { isRefusal, refuse, route } from '../utils/helpers'

const router = Router()

/**
 * GET /api/schedules
 * Every schedule by start date, with its next occurrence and how many of its
 * occurrences the last import stored.
 */
router.get(
  '/',
  route('failed to list schedules', async (_req: Request, res: Response) => {
    const response: SchedulesResponse = { schedules: await listSchedules() }
    res.json(response)
  }),
)

/**
 * GET /api/schedules/suggestions
 * The ten longest-running merchants charged once a month (at least three
 * months) that no schedule covers, each with the accounts it was charged to
 * and how much the amount moved.
 */
router.get(
  '/suggestions',
  route('failed to suggest schedules', async (_req: Request, res: Response) => {
    const response: ScheduleSuggestionsResponse = await scheduleSuggestions()
    res.json(response)
  }),
)

/**
 * POST /api/schedules
 * Body: a ScheduleRequest. Its occurrences are stored by the next import.
 */
router.post(
  '/',
  route('failed to create schedule', async (req: Request, res: Response) => {
    const parsed = parseScheduleRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const schedule = await createSchedule(parsed.value)
    if (isRefusal(schedule)) return refuse(res, schedule)
    const response: ScheduleResponse = { schedule }
    res.status(201).json(response)
  }),
)

/**
 * PUT /api/schedules/:id
 * Body: a ScheduleRequest, replacing the stored one. The next import rewrites
 * every occurrence with it, past ones included.
 */
router.put(
  '/:id',
  route('failed to update schedule', async (req: Request, res: Response) => {
    const id = parseScheduleId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })
    const parsed = parseScheduleRequest(req.body)
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })

    const schedule = await updateSchedule(id.value, parsed.value)
    if (isRefusal(schedule)) return refuse(res, schedule)
    const response: ScheduleResponse = { schedule }
    res.json(response)
  }),
)

/**
 * DELETE /api/schedules/:id
 * 204 once deleted. Its occurrences leave the ledger at the next import.
 */
router.delete(
  '/:id',
  route('failed to delete schedule', async (req: Request, res: Response) => {
    const id = parseScheduleId(req.params.id)
    if ('error' in id) return res.status(400).json({ error: id.error })

    const refusal = await deleteSchedule(id.value)
    if (refusal) return refuse(res, refusal)
    res.status(204).end()
  }),
)

export default router
