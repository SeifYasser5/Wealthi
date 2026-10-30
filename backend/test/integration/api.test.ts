import request from 'supertest'
import type { BalancesResponse, SpendingResponse, TransactionsResponse } from '@wealthi/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../../src/app'
import { prisma } from '../../src/db/client'
import { importFromChatDb } from '../../src/services/importer'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/** The read API over the imported fixture ledger, through Express but without a listening port. */

beforeAll(async () => {
  await resetDatabase()
  const chatDb = buildChatDb(LEDGER)
  try {
    await importFromChatDb(chatDb.path)
  } finally {
    chatDb.cleanup()
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/health', () => {
  it('is up', async () => {
    await request(app).get('/api/health').expect(200)
  })
})

describe('GET /api/accounts', () => {
  it('lists the configured accounts', async () => {
    const res = await request(app).get('/api/accounts').expect(200)
    expect(JSON.stringify(res.body)).toContain('savings_usd')
  })
})

describe('GET /api/transactions', () => {
  it('filters by month and account, newest first', async () => {
    const res = await request(app).get('/api/transactions?yearMonth=2026-01&account=checking').expect(200)
    expect(res.body.count).toBe(2)
    expect(res.body.transactions.map((t: { merchant: string }) => t.merchant)).toEqual(['CARD PAYMENT', 'EMPLOYER LTD'])
  })

  it('filters transfers in and out', async () => {
    const only = await request(app).get('/api/transactions?transfer=only').expect(200)
    const exclude = await request(app).get('/api/transactions?transfer=exclude').expect(200)
    expect(only.body.count).toBe(2)
    expect(exclude.body.count).toBe(5)
  })

  it('serves the SMS each row was parsed from, for the detail view', async () => {
    const res = await request(app).get('/api/transactions?yearMonth=2026-02').expect(200)
    const row = (res.body as TransactionsResponse).transactions.find((t) => t.merchant === 'CITY CAFE')
    expect(row?.rawText).toContain('CITY CAFE')
  })

  it.each([
    ['yearMonth=2026-1', /yearMonth/],
    ['account=nope', /account must be one of/],
    ['type=transfer', /type must be one of/],
    ['counterAccount=card&transfer=exclude', /cannot be combined/],
  ])('rejects ?%s', async (query, message) => {
    const res = await request(app).get(`/api/transactions?${query}`).expect(400)
    expect(res.body.error).toMatch(message)
  })
})

describe('GET /api/balances', () => {
  it('returns the month snapshot for every account', async () => {
    const res = await request(app).get('/api/balances?yearMonth=2026-02').expect(200)
    const body = res.body as BalancesResponse
    expect(body.count).toBe(3)
    expect(body.balances.find((b) => b.account === 'checking')).toMatchObject({
      openingBalance: 5750,
      closingBalance: 6950,
    })
  })

  it('requires yearMonth', async () => {
    await request(app).get('/api/balances').expect(400)
  })
})

describe('spending and categories', () => {
  it('breaks down non-transfer debits by category', async () => {
    const res = await request(app).get('/api/spending?yearMonth=2026-01').expect(200)
    const body = res.body as SpendingResponse
    // The CARD PAYMENT debit is a transfer, so only the grocery charge counts.
    expect(body.grandTotal).toBe(250)
    expect(body.categories.map((c) => [c.category, c.total])).toEqual([['Groceries', 250]])
  })

  it('lets a manual category override the merchant map, and clears it again', async () => {
    const tx = await prisma.transaction.findFirstOrThrow({ where: { yearMonth: '2026-01', merchant: 'ACME GROCERS' } })

    await request(app).patch(`/api/transactions/${tx.id}/category`).send({ category: 'Dining' }).expect(200)
    let spending = (await request(app).get('/api/spending?yearMonth=2026-01')).body as SpendingResponse
    expect(spending.categories.map((c) => c.category)).toEqual(['Dining'])

    await request(app).patch(`/api/transactions/${tx.id}/category`).send({ category: null }).expect(200)
    spending = (await request(app).get('/api/spending?yearMonth=2026-01')).body as SpendingResponse
    expect(spending.categories.map((c) => c.category)).toEqual(['Groceries'])
  })

  it('rejects a category that is not on the list', async () => {
    const tx = await prisma.transaction.findFirstOrThrow()
    const res = await request(app).patch(`/api/transactions/${tx.id}/category`).send({ category: 'Yachts' }).expect(400)
    expect(res.body.error).toMatch(/category must be null or one of/)
  })

  it('404s an unknown transaction', async () => {
    await request(app)
      .patch('/api/transactions/00000000-0000-4000-8000-000000000000/category')
      .send({ category: 'Rent' })
      .expect(404)
  })
})
