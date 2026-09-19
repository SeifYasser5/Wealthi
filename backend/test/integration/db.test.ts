import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBalancesByMonth, openingFor, upsertBalance } from '../../src/db/balances'
import { prisma } from '../../src/db/client'
import { isDbConnected } from '../../src/db/health'
import { getSpendingTransactions } from '../../src/db/spending'
import { createAllTransactions, findFromMonth, queryTransactions, updateCategory } from '../../src/db/transactions'
import { importFromChatDb } from '../../src/services/importer'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/** The db/ query layer against the imported fixture ledger. */

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

const merchants = (rows: { merchant: string | null }[]) => rows.map((r) => r.merchant)

describe('queryTransactions', () => {
  it('returns every row newest first, as domain objects', async () => {
    const all = await queryTransactions({})
    expect(all).toHaveLength(7)
    expect(all[0]).toMatchObject({
      merchant: 'CITY CAFE',
      amount: 40,
      type: 'debit',
      isTransfer: false,
      category: null,
    })
    expect(typeof all[0].amount).toBe('number')
    expect(all[0].transactedAt).toBeInstanceOf(Date)
    const times = all.map((t) => t.transactedAt.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('matches a merchant substring case-insensitively', async () => {
    expect(merchants(await queryTransactions({ merchant: 'acme' }))).toEqual(['ACME GROCERS', 'ACME GROCERS'])
  })

  it('filters by month, account and direction', async () => {
    const rows = await queryTransactions({ yearMonth: '2026-01', account: 'checking', type: 'credit' })
    expect(rows.map((r) => [r.merchant, r.amount])).toEqual([['EMPLOYER LTD', 5000]])
  })

  it('filters transfers, with a counter account narrowing further', async () => {
    expect(await queryTransactions({ transfer: 'only' })).toHaveLength(2)
    expect(await queryTransactions({ transfer: 'exclude' })).toHaveLength(5)
    const toCard = await queryTransactions({ counterAccount: 'card', transfer: 'only' })
    expect(toCard.map((r) => [r.account, r.counterAccount, r.isTransfer])).toEqual([['checking', 'card', true]])
  })
})

describe('findFromMonth', () => {
  it('returns months at or after the given one, chronologically', async () => {
    const rows = await findFromMonth('2026-02')
    expect(rows.map((r) => r.yearMonth)).toEqual(['2026-02', '2026-02', '2026-02'])
    expect(merchants(rows)).toEqual(['EMPLOYER LTD', 'ACME GROCERS', 'CITY CAFE'])
  })
})

describe('updateCategory', () => {
  it('sets and clears a category, returning the updated row', async () => {
    const [row] = await queryTransactions({ merchant: 'CITY CAFE' })
    expect((await updateCategory(row.id, 'Dining'))?.category).toBe('Dining')
    expect((await updateCategory(row.id, null))?.category).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    expect(await updateCategory('00000000-0000-4000-8000-000000000000', 'Rent')).toBeNull()
  })
})

describe('getSpendingTransactions', () => {
  it('returns non-transfer debits for the month, largest first', async () => {
    const rows = await getSpendingTransactions('2026-02')
    expect(rows.map((r) => [r.merchant, r.amount])).toEqual([
      ['ACME GROCERS', 100],
      ['CITY CAFE', 40],
    ])
    // January's CARD PAYMENT debit is a transfer, so only the grocery charge is spending.
    expect(merchants(await getSpendingTransactions('2026-01'))).toEqual(['ACME GROCERS'])
  })
})

describe('balances', () => {
  it('returns a month ordered by account, with nulls where no balance was reported', async () => {
    const rows = await findBalancesByMonth('2026-01')
    expect(rows.map((r) => r.account)).toEqual(['card', 'checking', 'savings_usd'])
    expect(rows[2]).toEqual({
      account: 'savings_usd',
      yearMonth: '2026-01',
      openingBalance: 0,
      debits: 0,
      credits: 0,
      transfersIn: 0,
      transfersOut: 0,
      closingBalance: 0,
      lastReportedBalance: null,
      discrepancy: null,
    })
    expect(await findBalancesByMonth('1999-01')).toEqual([])
  })

  it('opens a month with the closing balances of the latest earlier snapshot', async () => {
    expect(await openingFor('2026-02')).toEqual({ checking: 5750, card: 0, savings_usd: 0 })
    // Skips a gap: nothing is stored for 2026-05, so it reads February.
    expect(await openingFor('2026-06')).toEqual({ checking: 6950, card: -140, savings_usd: 0 })
  })

  it('falls back to config openingBalances before the first snapshot', async () => {
    expect(await openingFor('2026-01')).toEqual({ checking: 1000, card: 0, savings_usd: 0 })
  })

  it('upsert overwrites an existing snapshot and stamps computedAt', async () => {
    const before = await prisma.monthlyBalance.findUniqueOrThrow({
      where: { yearMonth_account: { yearMonth: '2026-01', account: 'savings_usd' } },
    })
    await upsertBalance({ ...(await findBalancesByMonth('2026-01'))[2], closingBalance: 12.34, discrepancy: 1 })
    const after = await prisma.monthlyBalance.findUniqueOrThrow({
      where: { yearMonth_account: { yearMonth: '2026-01', account: 'savings_usd' } },
    })
    expect(after.closingBalance.toNumber()).toBe(12.34)
    expect(after.discrepancy?.toNumber()).toBe(1)
    expect(after.computedAt.getTime()).toBeGreaterThanOrEqual(before.computedAt.getTime())
  })
})

describe('misc', () => {
  it('reports the database as connected', async () => {
    expect(await isDbConnected()).toBe(true)
  })

  it('inserts nothing for no transactions', async () => {
    expect(await createAllTransactions([], prisma)).toBe(0)
  })
})
