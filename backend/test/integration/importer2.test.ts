import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/db/client'
import { getImportCursor, setImportCursor } from '../../src/db/import-state'
import { importFromChatDb } from '../../src/services/importer2'
import { appendMessages, buildChatDb } from '../fixtures/chat-db'
import { at, BANK, LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/**
 * The incremental importer (importer2.ts, not wired to the server): reads past
 * the import_state cursor, inserts only new rows, and recomputes balances from
 * the earliest touched month through `now`.
 */

const MARCH = at('2026-03-15')
const LAST_BANK_ROWID = BigInt(LEDGER.map((m) => m.sender).lastIndexOf(BANK) + 1)
/** Appended messages get rowids after every ledger row, bank or not. */
const appended = (n: number) => BigInt(LEDGER.length + n)

let chatDb: ReturnType<typeof buildChatDb>

beforeAll(async () => {
  await resetDatabase()
  chatDb = buildChatDb(LEDGER)
})

afterAll(async () => {
  chatDb?.cleanup()
  await prisma.$disconnect()
})

const closing = async (yearMonth: string, account: string) =>
  (
    await prisma.monthlyBalance.findUniqueOrThrow({ where: { yearMonth_account: { yearMonth, account } } })
  ).closingBalance.toNumber()

describe('import_state cursor', () => {
  it('is undefined before any import, then holds the last value set', async () => {
    expect(await getImportCursor()).toBeUndefined()
    await setImportCursor(5n)
    await setImportCursor(3n)
    expect(await getImportCursor()).toBe(3n)
    await prisma.importState.deleteMany()
  })
})

describe('importer2', () => {
  it('first run: imports everything, fills every month through now, and sets the cursor', async () => {
    const summary = await importFromChatDb(chatDb.path, MARCH)
    expect(summary).toMatchObject({ months: 3, totalStored: 7 })
    expect(summary.errors).toHaveLength(3)
    expect(await getImportCursor()).toBe(LAST_BANK_ROWID)
    expect(await closing('2026-01', 'checking')).toBe(5750)
    expect(await closing('2026-02', 'checking')).toBe(6950)
    // A month with no messages still gets a snapshot carrying the balance forward.
    expect(await closing('2026-03', 'checking')).toBe(6950)
    expect(await closing('2026-03', 'card')).toBe(-140)
  })

  it('second run with nothing new: reads nothing and changes nothing', async () => {
    expect(await importFromChatDb(chatDb.path, MARCH)).toEqual({ months: 0, totalStored: 0, errors: [] })
    expect(await prisma.transaction.count()).toBe(7)
  })

  it('a back-dated message recomputes its month and cascades into every later one', async () => {
    appendMessages(chatDb.path, [
      {
        sender: BANK,
        date: at('2026-01-25'),
        text: 'Account *1111 credited with EGP 100.00 from EMPLOYER LTD. Balance EGP 5,850.00',
      },
      {
        sender: BANK,
        date: at('2026-03-02'),
        text: 'Account *1111 debited EGP 50.00 for OFFICE RENT. Balance EGP 7,000.00',
      },
    ])
    const summary = await importFromChatDb(chatDb.path, MARCH)
    expect(summary).toEqual({ months: 3, totalStored: 2, errors: [] })
    expect(await prisma.transaction.count()).toBe(9)
    expect(await closing('2026-01', 'checking')).toBe(5850)
    expect(await closing('2026-02', 'checking')).toBe(7050)
    expect(await closing('2026-03', 'checking')).toBe(7000)
    expect(await getImportCursor()).toBe(appended(2))
  })

  it('a message in a later month starts from the stored closing balance before it', async () => {
    appendMessages(chatDb.path, [
      {
        sender: BANK,
        date: at('2026-03-20'),
        text: 'Account *1111 debited EGP 1,000.00 for OFFICE RENT. Balance EGP 6,000.00',
      },
    ])
    const summary = await importFromChatDb(chatDb.path, MARCH)
    expect(summary.months).toBe(1)
    const march = await prisma.monthlyBalance.findUniqueOrThrow({
      where: { yearMonth_account: { yearMonth: '2026-03', account: 'checking' } },
    })
    expect(march.openingBalance.toNumber()).toBe(7050)
    expect(march.closingBalance.toNumber()).toBe(6000)
    expect(march.discrepancy?.toNumber()).toBe(0)
  })

  it('leaves the cursor alone when nothing new parses, so those messages are re-read next run', async () => {
    appendMessages(chatDb.path, [{ sender: BANK, date: at('2026-03-21'), text: 'Your one-time password is 111111.' }])
    const summary = await importFromChatDb(chatDb.path, MARCH)
    expect(summary).toMatchObject({ months: 0, totalStored: 0 })
    expect(summary.errors).toHaveLength(1)
    expect(await getImportCursor()).toBe(appended(3))
    expect((await importFromChatDb(chatDb.path, MARCH)).errors).toHaveLength(1)
  })

  it('refuses a missing chat.db', async () => {
    await expect(importFromChatDb('/nonexistent/chat.db')).rejects.toThrow('chat.db not found at: /nonexistent/chat.db')
  })

  // Known bug: createAllTransactions documents `skipDuplicates` against the
  // unique messageGuid, but never passes it, so re-reading an imported message
  // (a reset or lost cursor, a VACUUMed chat.db) aborts the whole import on a
  // unique-constraint error instead of skipping it. Remove `.fails` once fixed.
  it.fails('re-reading already-imported messages skips them instead of failing', async () => {
    await prisma.importState.deleteMany()
    await expect(importFromChatDb(chatDb.path, MARCH)).resolves.toMatchObject({ totalStored: 10 })
    expect(await prisma.transaction.count()).toBe(10)
  })

  // Known bug: decode() throws DecodeError for a message with neither text nor
  // attributedBody, and stageMessages doesn't catch it, so one such message
  // aborts the import. Remove `.fails` once it is collected as an error.
  it.fails('collects an undecodable message as an error instead of aborting', async () => {
    await setImportCursor(1000n)
    appendMessages(chatDb.path, [{ sender: BANK, date: at('2026-03-22') }])
    await prisma.importState.deleteMany()
    const summary = await importFromChatDb(chatDb.path, MARCH)
    expect(summary.errors.length).toBeGreaterThan(0)
  })
})
