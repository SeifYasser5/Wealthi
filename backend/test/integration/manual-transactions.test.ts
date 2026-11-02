import request from 'supertest'
import type { ManualTransactionRequest, ManualTransactionResponse, ManualTransactionsResponse } from '@wealthi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../../src/app'
import { prisma } from '../../src/db/client'
import { replaceManualTransactions, seedManualTransactions } from '../../src/db/manual-transactions'
import { importFromChatDb } from '../../src/services/importer'
import type { ManualEntry } from '../../src/utils/config'
import type { Minor } from '../../src/utils/money'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/**
 * The manual_transactions table through the API, and what the import makes of
 * it, over the fixture ledger (checking closes February at 6950 without them).
 */

beforeEach(resetDatabase)

afterAll(async () => {
  await prisma.$disconnect()
})

const fee: ManualTransactionRequest = {
  type: 'debit',
  amount: 50,
  account: 'checking',
  merchant: 'Bank fee',
  categoryId: null,
  date: '2026-02-10',
}

const create = async (body: ManualTransactionRequest = fee) =>
  ((await request(app).post('/api/manual-transactions').send(body).expect(201)).body as ManualTransactionResponse)
    .manualTransaction
const list = async () =>
  ((await request(app).get('/api/manual-transactions').expect(200)).body as ManualTransactionsResponse)
    .manualTransactions

async function runImport() {
  const chatDb = buildChatDb(LEDGER)
  try {
    return await importFromChatDb(chatDb.path)
  } finally {
    chatDb.cleanup()
  }
}

const closing = async (yearMonth: string) =>
  (
    await prisma.monthlyBalance.findUniqueOrThrow({
      where: { yearMonth_account: { yearMonth, account: 'checking' } },
    })
  ).closingBalance.toNumber()

describe('/api/manual-transactions', () => {
  it('stores one with the account’s currency and the category’s name', async () => {
    const { id } = await prisma.category.findUniqueOrThrow({ where: { name: 'Rent' } })
    expect(await create({ ...fee, categoryId: id })).toEqual({
      ...fee,
      id: expect.any(Number),
      currency: 'EGP',
      categoryId: id,
      category: 'Rent',
    })
  })

  it('lists newest first', async () => {
    await create({ ...fee, merchant: 'OLD', date: '2026-01-02' })
    await create({ ...fee, merchant: 'NEW', date: '2026-02-20' })
    expect((await list()).map((m) => m.merchant)).toEqual(['NEW', 'OLD'])
  })

  it('keeps only the month asked for, from its first day to its last', async () => {
    for (const [merchant, date] of [
      ['PREV', '2026-01-31'],
      ['FIRST', '2026-02-01'],
      ['LAST', '2026-02-28'],
      ['NEXT', '2026-03-01'],
    ])
      await create({ ...fee, merchant, date })
    const feb = await request(app).get('/api/manual-transactions?yearMonth=2026-02').expect(200)
    expect((feb.body as ManualTransactionsResponse).manualTransactions.map((m) => m.merchant)).toEqual([
      'LAST',
      'FIRST',
    ])
    expect(await list()).toHaveLength(4)
  })

  it('refuses a category that is not stored', async () => {
    await request(app)
      .post('/api/manual-transactions')
      .send({ ...fee, categoryId: 999_999 })
      .expect(400, { error: 'category 999999 does not exist' })
    expect(await prisma.manualTransaction.count()).toBe(0)
  })

  it('replaces one, and is 404 or 400 when it can’t', async () => {
    const { id } = await create()
    const res = await request(app)
      .put(`/api/manual-transactions/${id}`)
      .send({ ...fee, amount: 75.25, account: 'savings_usd' })
      .expect(200)
    expect((res.body as ManualTransactionResponse).manualTransaction).toMatchObject({
      id,
      amount: 75.25,
      currency: 'USD',
    })
    await request(app)
      .put('/api/manual-transactions/999999')
      .send(fee)
      .expect(404, { error: 'manual transaction 999999 not found' })
    await request(app)
      .put(`/api/manual-transactions/${id}`)
      .send({ ...fee, categoryId: 999_999 })
      .expect(400, { error: 'category 999999 does not exist' })
  })

  it('deletes one, then is 404', async () => {
    const { id } = await create()
    await request(app).delete(`/api/manual-transactions/${id}`).expect(204)
    expect(await list()).toEqual([])
    await request(app).delete(`/api/manual-transactions/${id}`).expect(404)
  })
})

describe('the import', () => {
  it('copies each into transactions and the balances, and again after every rebuild', async () => {
    await create()
    await runImport()
    const rows = await prisma.transaction.findMany({ where: { merchant: 'Bank fee' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ yearMonth: '2026-02', account: 'checking', messageGuid: null, rawText: null })
    expect(await closing('2026-02')).toBe(6900)

    await runImport()
    expect(await prisma.transaction.count({ where: { merchant: 'Bank fee' } })).toBe(1)
    expect(await closing('2026-02')).toBe(6900)
  })

  it('carries the category to the ledger row', async () => {
    const { id } = await prisma.category.findUniqueOrThrow({ where: { name: 'Rent' } })
    await create({ ...fee, categoryId: id })
    await runImport()
    expect((await prisma.transaction.findFirstOrThrow({ where: { merchant: 'Bank fee' } })).categoryId).toBe(id)
  })

  it('leaves a deleted one out of the next rebuild', async () => {
    const { id } = await create()
    await runImport()
    await request(app).delete(`/api/manual-transactions/${id}`).expect(204)
    await runImport()
    expect(await prisma.transaction.count({ where: { merchant: 'Bank fee' } })).toBe(0)
    expect(await closing('2026-02')).toBe(6950)
  })
})

describe('seeding', () => {
  const entries: ManualEntry[] = [
    {
      type: 'credit',
      amount: 500 as Minor,
      currency: 'EGP',
      account: 'checking',
      merchant: 'CASHBACK',
      date: '2026-03-15',
    },
  ]

  it('copies config’s entries into an empty table, once', async () => {
    expect(await seedManualTransactions(entries)).toBe(1)
    expect(await list()).toMatchObject([{ merchant: 'CASHBACK', amount: 5, date: '2026-03-15', categoryId: null }])
    expect(await seedManualTransactions(entries)).toBe(0)
    expect(await prisma.manualTransaction.count()).toBe(1)
  })

  it('is replaced wholesale by the demo’s reset', async () => {
    await create()
    await replaceManualTransactions(entries)
    expect((await list()).map((m) => m.merchant)).toEqual(['CASHBACK'])
  })
})
