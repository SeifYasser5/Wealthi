import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ImportSummary } from '../../src/utils/types'
import { resetDatabase } from '../setup/reset'

/**
 * The public demo, end to end: the demo ledger written to a chat.db and run
 * through the live importer under backend/demo's config and patterns. Every
 * message must parse and every month must reconcile, or the demo shows
 * parse errors and discrepancies to whoever opens it.
 */

const NOW = new Date('2026-10-14T15:00:00Z')

let summary: ImportSummary
let seedDemo: typeof import('../../src/demo/seed').seedDemo
let prisma: typeof import('../../src/db/client').prisma

beforeAll(async () => {
  // Config and patterns are read at import time, so load everything under the demo's.
  vi.resetModules()
  vi.stubEnv('WEALTHI_CONFIG_PATH', resolve(__dirname, '../../demo/wealthi.demo.json'))
  vi.stubEnv('WEALTHI_PATTERNS_DIR', resolve(__dirname, '../../demo/patterns'))
  ;({ prisma } = await import('../../src/db/client'))
  ;({ seedDemo } = await import('../../src/demo/seed'))

  await resetDatabase()
  summary = await seedDemo(NOW)
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await resetDatabase()
  await prisma?.$disconnect()
})

describe('seedDemo', () => {
  it('parses every demo message: no errors, six months', async () => {
    expect(summary.errors).toEqual([])
    expect(summary.months).toBe(6)
    expect(await prisma.transaction.count()).toBe(summary.totalStored)
  })

  it('reconciles every month: the SMS balances match the computed ones', async () => {
    const balances = await prisma.monthlyBalance.findMany({ orderBy: [{ yearMonth: 'asc' }, { account: 'asc' }] })
    expect(balances).toHaveLength(6 * 3)
    for (const b of balances) {
      // The card's SMS print its available limit, which the patterns don't extract;
      // the USD account has no SMS on the 14th yet (its saving lands on the 26th).
      if (b.account === 'credit_card' || (b.account === 'savings_usd' && b.yearMonth === '2026-10')) {
        expect(b.discrepancy).toBeNull()
      } else {
        expect(b.discrepancy?.toNumber(), `${b.account} ${b.yearMonth}`).toBe(0)
      }
    }
    const first = balances.filter((b) => b.yearMonth === '2026-05').map((b) => [b.account, b.openingBalance.toNumber()])
    expect(first).toEqual([
      ['checking', 38500],
      ['credit_card', -7450],
      ['savings_usd', 1200],
    ])
  })

  it('tags the card payments and USD savings as transfers, and categorizes by merchant', async () => {
    const transfers = await prisma.transaction.groupBy({
      by: ['account', 'counterAccount'],
      where: { counterAccount: { not: null } },
      _count: true,
      orderBy: { account: 'asc' },
    })
    expect(transfers.map((t) => [t.account, t.counterAccount])).toEqual([
      ['checking', 'credit_card'],
      ['checking', 'savings_usd'],
      ['credit_card', 'checking'],
      ['savings_usd', 'checking'],
    ])
    const rent = await prisma.transaction.findFirstOrThrow({ where: { merchant: 'RENT TRANSFER' } })
    expect(rent).toMatchObject({ account: 'checking', type: 'debit', counterAccount: null })
    expect(rent.rawText).toMatch(/^Account \*4821 debited EGP 14,000\.00 for RENT TRANSFER\./)
  })

  it('reseeds over its own data, but refuses a database holding anything else', async () => {
    await expect(seedDemo(NOW)).resolves.toMatchObject({ errors: [] })

    await prisma.transaction.create({
      data: {
        yearMonth: '2026-10',
        type: 'debit',
        amount: '1.00',
        currency: 'EGP',
        account: 'checking',
        transactedAt: NOW,
        messageGuid: 'C0FFEE00-REAL-MESSAGE',
      },
    })
    await expect(seedDemo(NOW)).rejects.toThrow('the database holds 1 transactions that are not demo data')
    expect(await prisma.transaction.count()).toBe(summary.totalStored + 1)
  })
})
