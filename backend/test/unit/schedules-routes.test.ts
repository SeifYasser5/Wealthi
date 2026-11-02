import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureAccounts } from '../fixtures/settings'

// /api/schedules with db/schedules mocked: status codes, refusals and failing
// queries. The happy paths against real Postgres live in integration/schedules.test.ts.

const db = vi.hoisted(() => ({
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  listRecurringCandidates: vi.fn(),
  listScheduledMerchants: vi.fn(),
}))
vi.mock('../../src/db/schedules', () => db)

vi.mock('../../src/db/accounts', () => ({ listAccounts: vi.fn() }))

const { default: app } = await import('../../src/app')
const { listAccounts } = await import('../../src/db/accounts')

const boom = () => Promise.reject(new Error('connection refused'))

const body = {
  type: 'debit',
  amount: 100,
  account: 'checking',
  merchant: 'RENT',
  categoryId: null,
  frequency: 'monthly',
  interval: 1,
  startDate: '2026-01-01',
  endDate: null,
}
const input = { ...body, amount: 10000, currency: 'EGP' }
const schedule = { ...body, id: 1, currency: 'EGP', category: null, nextDate: '2026-02-01', transactionCount: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listAccounts).mockResolvedValue(fixtureAccounts)
})

describe('GET /api/schedules', () => {
  it('lists every schedule', async () => {
    db.listSchedules.mockResolvedValue([schedule])
    expect((await request(app).get('/api/schedules').expect(200)).body).toEqual({ schedules: [schedule] })
  })

  it('is 500 when the query fails', async () => {
    db.listSchedules.mockImplementation(boom)
    expect((await request(app).get('/api/schedules').expect(500)).body).toEqual({ error: 'failed to list schedules' })
  })
})

describe('GET /api/schedules/suggestions', () => {
  const candidate = (day: string) => ({
    merchant: 'GYM',
    type: 'debit',
    amount: 30000,
    currency: 'EGP',
    account: 'checking',
    day,
  })

  it('suggests the unscheduled merchants charged once a month', async () => {
    db.listRecurringCandidates.mockResolvedValue(['2026-01-03', '2026-02-03', '2026-03-03'].map(candidate))
    db.listScheduledMerchants.mockResolvedValue(new Set())
    const res = await request(app).get('/api/schedules/suggestions').expect(200)
    expect(res.body.minMonths).toBe(3)
    expect(res.body.suggestions).toMatchObject([
      { merchant: 'GYM', months: 3, accounts: [{ account: 'checking', count: 3 }], nextDate: '2026-04-03' },
    ])
  })

  it('is 500 when the query fails', async () => {
    db.listRecurringCandidates.mockImplementation(boom)
    db.listScheduledMerchants.mockResolvedValue(new Set())
    expect((await request(app).get('/api/schedules/suggestions').expect(500)).body).toEqual({
      error: 'failed to suggest schedules',
    })
  })
})

describe('POST /api/schedules', () => {
  it('creates one from the validated body', async () => {
    db.createSchedule.mockResolvedValue(schedule)
    const res = await request(app).post('/api/schedules').send(body).expect(201)
    expect(res.body).toEqual({ schedule })
    expect(db.createSchedule).toHaveBeenCalledWith(input)
  })

  it('is 400 on a bad body, without a write', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ ...body, frequency: 'hourly' })
      .expect(400)
    expect(res.body.error).toMatch(/^frequency must be one of/)
    expect(db.createSchedule).not.toHaveBeenCalled()
  })

  it('is 400 on a category that is not stored', async () => {
    db.createSchedule.mockResolvedValue({ refused: 'invalid', error: 'category 9 does not exist' })
    const res = await request(app)
      .post('/api/schedules')
      .send({ ...body, categoryId: 9 })
      .expect(400)
    expect(res.body).toEqual({ error: 'category 9 does not exist' })
  })

  it('is 500 when the write fails', async () => {
    db.createSchedule.mockImplementation(boom)
    await request(app).post('/api/schedules').send(body).expect(500, { error: 'failed to create schedule' })
  })
})

describe('PUT /api/schedules/:id', () => {
  it('replaces one', async () => {
    db.updateSchedule.mockResolvedValue(schedule)
    expect((await request(app).put('/api/schedules/1').send(body).expect(200)).body).toEqual({ schedule })
    expect(db.updateSchedule).toHaveBeenCalledWith(1, input)
  })

  it('is 400 on a bad id or body', async () => {
    await request(app).put('/api/schedules/x').send(body).expect(400)
    await request(app)
      .put('/api/schedules/1')
      .send({ ...body, amount: 0 })
      .expect(400, { error: 'amount must be more than 0' })
    expect(db.updateSchedule).not.toHaveBeenCalled()
  })

  it('is 404 on an unknown id', async () => {
    db.updateSchedule.mockResolvedValue({ refused: 'not found', error: 'schedule 5 not found' })
    await request(app).put('/api/schedules/5').send(body).expect(404, { error: 'schedule 5 not found' })
  })

  it('is 500 when the write fails', async () => {
    db.updateSchedule.mockImplementation(boom)
    await request(app).put('/api/schedules/1').send(body).expect(500, { error: 'failed to update schedule' })
  })
})

describe('DELETE /api/schedules/:id', () => {
  it('is 204 once deleted', async () => {
    db.deleteSchedule.mockResolvedValue(null)
    await request(app).delete('/api/schedules/3').expect(204)
    expect(db.deleteSchedule).toHaveBeenCalledWith(3)
  })

  it('is 400 on a bad id', async () => {
    await request(app).delete('/api/schedules/0').expect(400)
    expect(db.deleteSchedule).not.toHaveBeenCalled()
  })

  it('is 404 on an unknown id', async () => {
    db.deleteSchedule.mockResolvedValue({ refused: 'not found', error: 'schedule 3 not found' })
    await request(app).delete('/api/schedules/3').expect(404)
  })

  it('is 500 when the write fails', async () => {
    db.deleteSchedule.mockImplementation(boom)
    await request(app).delete('/api/schedules/3').expect(500, { error: 'failed to delete schedule' })
  })
})
