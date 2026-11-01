import request from 'supertest'
import type { ScheduleRequest, ScheduleResponse, SchedulesResponse, TransactionsResponse } from '@wealthi/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../../src/app'
import { prisma } from '../../src/db/client'
import { replaceSchedules, seedSchedules } from '../../src/db/schedules'
import { importFromChatDb } from '../../src/services/importer'
import type { RecurringEntry } from '../../src/utils/config'
import type { Minor } from '../../src/utils/money'
import { buildChatDb } from '../fixtures/chat-db'
import { at, LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/**
 * The schedules table through the API, and what the import makes of it, over
 * the fixture ledger (checking closes February at 6950 without schedules).
 * Today is pinned to 20 February 2026.
 */

const TODAY = at('2026-02-20')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY })
  await resetDatabase()
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const rent: ScheduleRequest = {
  type: 'debit',
  amount: 1000,
  account: 'checking',
  merchant: 'RENT',
  categoryId: null,
  frequency: 'monthly',
  interval: 1,
  startDate: '2026-01-05',
  endDate: null,
}

const create = async (body: ScheduleRequest = rent) =>
  ((await request(app).post('/api/schedules').send(body).expect(201)).body as ScheduleResponse).schedule
const list = async () => ((await request(app).get('/api/schedules').expect(200)).body as SchedulesResponse).schedules

async function runImport() {
  const chatDb = buildChatDb(LEDGER)
  try {
    return await importFromChatDb(chatDb.path)
  } finally {
    chatDb.cleanup()
  }
}

const scheduled = () => prisma.transaction.findMany({ where: { merchant: 'RENT' }, orderBy: { transactedAt: 'asc' } })
const closing = async (yearMonth: string) =>
  (
    await prisma.monthlyBalance.findUniqueOrThrow({
      where: { yearMonth_account: { yearMonth, account: 'checking' } },
    })
  ).closingBalance.toNumber()

describe('POST /api/schedules', () => {
  it('stores one, with the account’s currency and its next occurrence', async () => {
    expect(await create()).toEqual({
      ...rent,
      id: expect.any(Number),
      currency: 'EGP',
      category: null,
      nextDate: '2026-03-05',
      transactionCount: 0,
    })
  })

  it('gives the category’s name', async () => {
    const { id } = await prisma.category.findUniqueOrThrow({ where: { name: 'Rent' } })
    expect(await create({ ...rent, categoryId: id })).toMatchObject({ categoryId: id, category: 'Rent' })
  })

  it('refuses a category that is not stored', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ ...rent, categoryId: 999_999 })
      .expect(400)
    expect(res.body).toEqual({ error: 'category 999999 does not exist' })
    expect(await prisma.schedule.count()).toBe(0)
  })
})

describe('GET /api/schedules', () => {
  it('lists every schedule by start date, with no next date once it has ended', async () => {
    await create({ ...rent, merchant: 'GYM', startDate: '2026-02-01', frequency: 'weekly' })
    await create({ ...rent, endDate: '2026-02-05' })
    expect((await list()).map((s) => [s.merchant, s.nextDate])).toEqual([
      ['RENT', null],
      ['GYM', '2026-02-22'],
    ])
  })
})

describe('PUT /api/schedules/:id', () => {
  it('replaces one', async () => {
    const { id } = await create()
    const res = await request(app)
      .put(`/api/schedules/${id}`)
      .send({ ...rent, amount: 1250.5, frequency: 'yearly', account: 'savings_usd' })
      .expect(200)
    expect((res.body as ScheduleResponse).schedule).toMatchObject({
      id,
      amount: 1250.5,
      currency: 'USD',
      frequency: 'yearly',
      nextDate: '2027-01-05',
    })
  })

  it('is 404 for an unknown id, and 400 for a category that is not stored', async () => {
    await request(app).put('/api/schedules/999999').send(rent).expect(404, { error: 'schedule 999999 not found' })
    const { id } = await create()
    await request(app)
      .put(`/api/schedules/${id}`)
      .send({ ...rent, categoryId: 999_999 })
      .expect(400, { error: 'category 999999 does not exist' })
  })
})

describe('DELETE /api/schedules/:id', () => {
  it('deletes one, then is 404', async () => {
    const { id } = await create()
    await request(app).delete(`/api/schedules/${id}`).expect(204)
    expect(await list()).toEqual([])
    await request(app)
      .delete(`/api/schedules/${id}`)
      .expect(404, { error: `schedule ${id} not found` })
  })
})

describe('the import', () => {
  it('stores each occurrence through today, marked with its schedule, and counts it in balances', async () => {
    const { id: categoryId } = await prisma.category.findUniqueOrThrow({ where: { name: 'Rent' } })
    const { id } = await create({ ...rent, categoryId })
    const summary = await runImport()

    const rows = await scheduled()
    expect(rows.map((t) => [t.transactedAt.toISOString(), t.yearMonth, t.scheduleId, t.categoryId])).toEqual([
      ['2026-01-05T00:00:00.000Z', '2026-01', id, categoryId],
      ['2026-02-05T00:00:00.000Z', '2026-02', id, categoryId],
    ])
    expect(rows[0]).toMatchObject({ type: 'debit', currency: 'EGP', account: 'checking', reportedBalance: null })
    expect(rows[0].amount.toNumber()).toBe(1000)
    expect(summary.totalStored).toBe(9)
    // 5750 − 1000 in January, 6950 − 2000 in February.
    expect([await closing('2026-01'), await closing('2026-02')]).toEqual([4750, 4950])
    expect((await list())[0].transactionCount).toBe(2)
  })

  it('serves the mark with each transaction, null on every other row', async () => {
    const { id } = await create()
    await runImport()
    const { transactions } = (await request(app).get('/api/transactions?yearMonth=2026-02').expect(200))
      .body as TransactionsResponse
    expect(transactions.filter((t) => t.scheduleId !== null).map((t) => [t.merchant, t.scheduleId])).toEqual([
      ['RENT', id],
    ])
    expect(transactions.length).toBeGreaterThan(1)
  })

  it('adds nothing before the start date, after the end date, or after today', async () => {
    await create({ ...rent, startDate: '2026-02-21' })
    await create({ ...rent, frequency: 'daily', startDate: '2026-02-18', endDate: '2026-02-19' })
    await runImport()
    expect((await scheduled()).map((t) => t.transactedAt.toISOString().slice(0, 10))).toEqual([
      '2026-02-18',
      '2026-02-19',
    ])
  })

  it('rewrites every occurrence, past ones included, after an edit', async () => {
    const { id } = await create()
    await runImport()
    await request(app)
      .put(`/api/schedules/${id}`)
      .send({ ...rent, amount: 500 })
      .expect(200)
    // Until the next import the stored rows keep the old amount.
    expect((await scheduled()).map((t) => t.amount.toNumber())).toEqual([1000, 1000])

    await runImport()
    expect((await scheduled()).map((t) => t.amount.toNumber())).toEqual([500, 500])
    expect(await closing('2026-02')).toBe(5950)
  })

  it('keeps a deleted schedule’s rows, unmarked, until the next import leaves them out', async () => {
    const { id } = await create()
    await runImport()
    await request(app).delete(`/api/schedules/${id}`).expect(204)
    expect((await scheduled()).map((t) => t.scheduleId)).toEqual([null, null])
    expect(await closing('2026-02')).toBe(4950)

    await runImport()
    expect(await scheduled()).toEqual([])
    expect(await closing('2026-02')).toBe(6950)
  })
})

describe('the seed from config', () => {
  const entry: RecurringEntry = {
    type: 'debit',
    amount: 2500 as Minor,
    currency: 'EGP',
    account: 'card',
    merchant: 'STREAMING',
    startYearMonth: '2026-02',
    dayOfMonth: 30,
  }

  it('stores recurringTransactions as monthly schedules when none is stored', async () => {
    expect(await seedSchedules([entry])).toBe(1)
    expect(await list()).toEqual([
      expect.objectContaining({
        type: 'debit',
        amount: 25,
        currency: 'EGP',
        account: 'card',
        merchant: 'STREAMING',
        categoryId: null,
        frequency: 'monthly',
        interval: 1,
        // February has no 30th.
        startDate: '2026-03-30',
        endDate: null,
      }),
    ])
  })

  it('never touches stored schedules', async () => {
    await create()
    expect(await seedSchedules([entry])).toBe(0)
    expect((await list()).map((s) => s.merchant)).toEqual(['RENT'])
  })

  it('replaces every schedule with config’s, for the demo', async () => {
    await create()
    await replaceSchedules([entry])
    expect((await list()).map((s) => s.merchant)).toEqual(['STREAMING'])
    await replaceSchedules([])
    expect(await list()).toEqual([])
  })
})
