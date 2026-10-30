import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/db/client'
import { importFromChatDb } from '../../src/services/importer'
import type { ImportSummary } from '../../src/utils/types'
import { appendMessages, buildChatDb } from '../fixtures/chat-db'
import { at, BANK, LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/**
 * The full live import path: synthetic chat.db → reader → decode → patterns →
 * transfer rules → balance cascade → Postgres. See fixtures/messages.ts for
 * the ledger and the numbers it should produce.
 */

let chatDb: ReturnType<typeof buildChatDb>
let summary: ImportSummary

beforeAll(async () => {
  await resetDatabase()
  chatDb = buildChatDb(LEDGER)
  summary = await importFromChatDb(chatDb.path)
})

afterAll(async () => {
  chatDb?.cleanup()
  await prisma.$disconnect()
})

const balance = (yearMonth: string, account: string) =>
  prisma.monthlyBalance.findUniqueOrThrow({ where: { yearMonth_account: { yearMonth, account } } })

describe('importFromChatDb', () => {
  it('stores every parsed transaction and reports the rest as errors', () => {
    expect(summary.months).toBe(2)
    expect(summary.totalStored).toBe(7)
    // The USD charge is skipped on purpose and must not appear here.
    expect(summary.errors.map((e) => e.decoded.text)).toEqual([
      'Your one-time password is 482913. Do not share it.',
      'Your card ending *9999 was charged EGP 10.00 at ACME GROCERS. Available balance EGP 90.00',
      'Cash withdrawal of EGP 300.00 from *1111',
    ])
  })

  it('writes the transactions with their chat.db identity', async () => {
    const rows = await prisma.transaction.findMany({ orderBy: [{ transactedAt: 'asc' }, { sourceRowid: 'asc' }] })
    expect(rows.map((r) => [r.yearMonth, r.account, r.type, r.amount.toNumber(), r.merchant])).toEqual([
      ['2026-01', 'card', 'debit', 250, 'ACME GROCERS'],
      ['2026-01', 'checking', 'credit', 5000, 'EMPLOYER LTD'],
      ['2026-01', 'checking', 'debit', 250, 'CARD PAYMENT'],
      ['2026-01', 'card', 'credit', 250, 'CARD PAYMENT'],
      ['2026-02', 'checking', 'credit', 1200, 'EMPLOYER LTD'],
      ['2026-02', 'card', 'debit', 100, 'ACME GROCERS'],
      ['2026-02', 'card', 'debit', 40, 'CITY CAFE'],
    ])
    expect(rows.every((r) => r.messageGuid?.startsWith('fixture-') && r.sourceRowid !== null)).toBe(true)
  })

  it('stores the SMS body each row was parsed from', async () => {
    const row = await prisma.transaction.findFirstOrThrow({ where: { merchant: 'CITY CAFE' } })
    expect(row.rawText).toContain('CITY CAFE')
  })

  it('decodes a message that only has an attributedBody', async () => {
    const row = await prisma.transaction.findFirstOrThrow({ where: { yearMonth: '2026-02', account: 'checking' } })
    expect(row.reportedBalance?.toNumber()).toBe(6950)
  })

  it('tags both legs of a card payment as a transfer', async () => {
    const legs = await prisma.transaction.findMany({ where: { merchant: 'CARD PAYMENT' }, orderBy: { account: 'asc' } })
    expect(legs.map((l) => [l.account, l.counterAccount])).toEqual([
      ['card', 'checking'],
      ['checking', 'card'],
    ])
  })

  it('cascades closing balances into the next month', async () => {
    const jan = await balance('2026-01', 'checking')
    const feb = await balance('2026-02', 'checking')
    expect(jan.openingBalance.toNumber()).toBe(1000)
    expect(jan.closingBalance.toNumber()).toBe(5750)
    expect(jan.discrepancy?.toNumber()).toBe(0)
    expect(feb.openingBalance.toNumber()).toBe(5750)
    expect(feb.closingBalance.toNumber()).toBe(6950)
    expect(feb.discrepancy?.toNumber()).toBe(0)

    const cardJan = await balance('2026-01', 'card')
    expect(cardJan.transfersIn.toNumber()).toBe(250)
    expect(cardJan.closingBalance.toNumber()).toBe(0)
    expect((await balance('2026-02', 'card')).closingBalance.toNumber()).toBe(-140)
  })

  it('writes a snapshot for every configured account, even without activity', async () => {
    expect(await prisma.monthlyBalance.count({ where: { account: 'savings_usd' } })).toBe(2)
  })

  it('is a full rebuild: a second run replaces rather than duplicates', async () => {
    const again = await importFromChatDb(chatDb.path)
    expect(again.totalStored).toBe(7)
    expect(await prisma.transaction.count()).toBe(7)
    expect(await prisma.monthlyBalance.count()).toBe(6)
  })

  it('refuses a missing chat.db', async () => {
    await expect(importFromChatDb('/nonexistent/chat.db')).rejects.toThrow('chat.db not found at: /nonexistent/chat.db')
  })

  it('stores nothing and keeps the ledger when no message parses', async () => {
    const empty = buildChatDb([{ sender: BANK, date: at('2026-03-01'), text: 'Your one-time password is 1.' }])
    try {
      const result = await importFromChatDb(empty.path)
      expect(result).toMatchObject({ months: 0, totalStored: 0 })
      expect(result.errors).toHaveLength(1)
      expect(await prisma.transaction.count()).toBe(7)
    } finally {
      empty.cleanup()
    }
  })

  // Known bug: decode() throws DecodeError for a message with neither text nor
  // attributedBody, and stageMessages doesn't catch it, so one such message
  // aborts the whole import. Remove `.fails` once it is collected as an error.
  it.fails('collects an undecodable message as an error instead of aborting', async () => {
    appendMessages(chatDb.path, [{ sender: BANK, date: at('2026-02-10') }])
    const result = await importFromChatDb(chatDb.path)
    expect(result.errors).toHaveLength(4)
  })
})
