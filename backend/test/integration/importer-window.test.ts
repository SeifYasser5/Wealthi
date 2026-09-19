import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ImportSummary } from '../../src/utils/types'
import { buildChatDb, type FixtureMessage } from '../fixtures/chat-db'
import { at, BANK } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/**
 * The live importer's balance rules that the two-month ledger can't reach,
 * under fixtures/wealthi.full.json:
 * - only the last 6 months get snapshots, and openingBalances seed the first of them
 * - manual, recurring and CSV entries count towards balances but are never
 *   inserted into `transactions`
 *
 * Seven monthly salaries (2025-09 … 2026-03) plus config entries through April:
 *   checking  Nov 100+1000=1100  Dec 2100  Jan 3100  Feb +1000−10 fee = 4090
 *             Mar +1000 −10 fee +5 cashback +1000 +500 conversions (CSV) = 6585
 *             Apr −10 fee = 6575
 *   card      Feb −75.50 (CSV)  Mar −20 +30 (CSV) = −65.50  Apr −65.50
 */

const SALARY_MONTHS = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']
const messages: FixtureMessage[] = SALARY_MONTHS.map((ym) => ({
  sender: BANK,
  date: at(`${ym}-25`),
  text: 'Account *1111 credited with EGP 1,000.00 from EMPLOYER LTD. Balance EGP 1.00',
}))

let chatDb: ReturnType<typeof buildChatDb>
let summary: ImportSummary
let prisma: typeof import('../../src/db/client').prisma

beforeAll(async () => {
  // Config and manual entries are read at import time, under this config and clock.
  vi.resetModules()
  vi.stubEnv('WEALTHI_CONFIG_PATH', resolve(__dirname, '../fixtures/wealthi.full.json'))
  vi.useFakeTimers({ toFake: ['Date'], now: at('2026-04-20') })
  ;({ prisma } = await import('../../src/db/client'))
  const { importFromChatDb } = await import('../../src/services/importer')

  await resetDatabase()
  chatDb = buildChatDb(messages)
  summary = await importFromChatDb(chatDb.path)
})

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  chatDb?.cleanup()
  await prisma?.$disconnect()
})

const snapshots = async (account: string) =>
  (await prisma.monthlyBalance.findMany({ where: { account }, orderBy: { yearMonth: 'asc' } })).map((b) => [
    b.yearMonth,
    b.openingBalance.toNumber(),
    b.closingBalance.toNumber(),
  ])

describe('importer: rolling window and config entries', () => {
  it('stores every SMS transaction but snapshots only the last 6 months', async () => {
    expect(summary).toMatchObject({ months: 6, totalStored: 7, errors: [] })
    expect(await prisma.transaction.count()).toBe(7)
    expect((await prisma.transaction.findFirstOrThrow({ orderBy: { transactedAt: 'asc' } })).yearMonth).toBe('2025-09')
  })

  it('seeds the first month of the window with openingBalances and cascades from there', async () => {
    expect(await snapshots('checking')).toEqual([
      ['2025-11', 100, 1100],
      ['2025-12', 1100, 2100],
      ['2026-01', 2100, 3100],
      ['2026-02', 3100, 4090],
      ['2026-03', 4090, 6585],
      ['2026-04', 6585, 6575],
    ])
  })

  it('counts CSV rows, with the sign deciding direction when the file has no type', async () => {
    expect(await snapshots('card')).toEqual([
      ['2025-11', 0, 0],
      ['2025-12', 0, 0],
      ['2026-01', 0, 0],
      ['2026-02', 0, -75.5],
      ['2026-03', -75.5, -65.5],
      ['2026-04', -65.5, -65.5],
    ])
    const march = await prisma.monthlyBalance.findUniqueOrThrow({
      where: { yearMonth_account: { yearMonth: '2026-03', account: 'card' } },
    })
    expect([march.debits.toNumber(), march.credits.toNumber()]).toEqual([20, 30])
  })

  it('never inserts manual, recurring or CSV entries as transactions', async () => {
    const merchants = (await prisma.transaction.findMany({ select: { merchant: true } })).map((t) => t.merchant)
    expect(new Set(merchants)).toEqual(new Set(['EMPLOYER LTD']))
  })
})
