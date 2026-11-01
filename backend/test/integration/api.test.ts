import request from 'supertest'
import type {
  BalancesResponse,
  ImportResponse,
  InsightsResponse,
  SpendingResponse,
  TransactionsResponse,
} from '@wealthi/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import app from '../../src/app'
import { prisma } from '../../src/db/client'
import { importFromChatDb } from '../../src/services/importer'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'
import type { ImportSummary } from '../../src/utils/types'

/** The read API over the imported fixture ledger, through Express but without a listening port. */

let summary: ImportSummary

beforeAll(async () => {
  await resetDatabase()
  const chatDb = buildChatDb(LEDGER)
  try {
    summary = await importFromChatDb(chatDb.path)
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

describe('POST /api/import', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rebuilds the same ledger from chat.db and reports it', async () => {
    const chatDb = buildChatDb(LEDGER)
    vi.stubEnv('IMESSAGE_DB_PATH', chatDb.path)
    try {
      const res = await request(app).post('/api/import').expect(200)
      const report = res.body as ImportResponse
      expect(report).toMatchObject({ status: 'completed', source: chatDb.path, months: summary.months })
      expect(report.totalStored).toBe(summary.totalStored)
      expect(report.parseErrors).toHaveLength(summary.errors.length)
      expect(await prisma.transaction.count()).toBe(summary.totalStored)
    } finally {
      chatDb.cleanup()
    }
  })

  it('skips, keeping the stored ledger, when there is no chat.db', async () => {
    vi.stubEnv('IMESSAGE_DB_PATH', '/nonexistent/chat.db')
    const res = await request(app).post('/api/import').expect(200)
    expect(res.body).toMatchObject({ status: 'skipped', totalStored: 0 })
    expect(await prisma.transaction.count()).toBe(summary.totalStored)
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

describe('GET /api/insights', () => {
  it('lists every non-transfer row oldest first, with its category resolved', async () => {
    const res = await request(app).get('/api/insights').expect(200)
    const body = res.body as InsightsResponse
    expect(body.uncategorized).toBe('Uncategorized')
    // The CARD PAYMENT legs are a transfer, so neither is listed.
    expect(body.rows.map((r) => [r.yearMonth, r.type, r.merchant, r.amount, r.category])).toEqual([
      ['2026-01', 'debit', 'ACME GROCERS', 250, 'Groceries'],
      ['2026-01', 'credit', 'EMPLOYER LTD', 5000, 'Uncategorized'],
      ['2026-02', 'credit', 'EMPLOYER LTD', 1200, 'Uncategorized'],
      ['2026-02', 'debit', 'ACME GROCERS', 100, 'Groceries'],
      ['2026-02', 'debit', 'CITY CAFE', 40, 'Uncategorized'],
    ])
    const times = body.rows.map((r) => r.transactedAt)
    expect(times).toEqual([...times].sort())
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
    const dining = await prisma.category.findUniqueOrThrow({ where: { name: 'Dining' } })

    const res = await request(app).patch(`/api/transactions/${tx.id}/category`).send({ categoryId: dining.id }).expect(200) // prettier-ignore
    expect(res.body.transaction).toMatchObject({ categoryId: dining.id, category: 'Dining' })
    let spending = (await request(app).get('/api/spending?yearMonth=2026-01')).body as SpendingResponse
    expect(spending.categories.map((c) => c.category)).toEqual(['Dining'])

    await request(app).patch(`/api/transactions/${tx.id}/category`).send({ categoryId: null }).expect(200)
    spending = (await request(app).get('/api/spending?yearMonth=2026-01')).body as SpendingResponse
    expect(spending.categories.map((c) => c.category)).toEqual(['Groceries'])
  })

  it('rejects a category that is not stored', async () => {
    const tx = await prisma.transaction.findFirstOrThrow()
    await request(app)
      .patch(`/api/transactions/${tx.id}/category`)
      .send({ categoryId: 999_999 })
      .expect(400, { error: 'category 999999 does not exist' })
  })

  it('404s an unknown transaction', async () => {
    await request(app)
      .patch('/api/transactions/00000000-0000-4000-8000-000000000000/category')
      .send({ categoryId: null })
      .expect(404, { error: 'transaction not found' })
  })
})
