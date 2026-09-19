import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// manualTransactions is computed once, at import, from config and today's
// date — so each test loads it fresh under a frozen clock.
async function load(now: Date) {
  vi.resetModules()
  vi.stubEnv('WEALTHI_CONFIG_PATH', resolve(__dirname, '../fixtures/wealthi.full.json'))
  vi.useFakeTimers({ toFake: ['Date'], now })
  return (await import('../../src/utils/helpers/manual-transactions')).manualTransactions
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('manualTransactions', () => {
  it('expands a recurring entry once per month from its start through the current month', async () => {
    const txs = await load(new Date(2026, 3, 20)) // April 2026
    const fees = txs.filter((t) => t.merchant === 'MONTHLY FEE')
    expect(fees.map((t) => t.yearMonth)).toEqual(['2026-02', '2026-03', '2026-04'])
    expect(fees[0]).toMatchObject({
      type: 'debit',
      amount: 10,
      currency: 'EGP',
      account: 'checking',
      counterAccount: null,
      reportedBalance: null,
    })
  })

  it('includes the current month even before its day has come', async () => {
    const fees = (await load(new Date(2026, 1, 1))).filter((t) => t.merchant === 'MONTHLY FEE')
    expect(fees.map((t) => t.yearMonth)).toEqual(['2026-02'])
  })

  it('produces nothing for a start month still in the future', async () => {
    const fees = (await load(new Date(2026, 0, 31))).filter((t) => t.merchant === 'MONTHLY FEE')
    expect(fees).toEqual([])
  })

  it('rolls over the year boundary', async () => {
    const fees = (await load(new Date(2027, 0, 5))).filter((t) => t.merchant === 'MONTHLY FEE')
    expect(fees).toHaveLength(12)
    expect(fees.at(-2)?.yearMonth).toBe('2026-12')
    expect(fees.at(-1)?.yearMonth).toBe('2027-01')
  })

  it('stages one-off entries as-is, bucketed by their date', async () => {
    const cashback = (await load(new Date(2026, 3, 1))).find((t) => t.merchant === 'CASHBACK')
    expect(cashback).toMatchObject({ type: 'credit', amount: 5, yearMonth: '2026-03', counterAccount: null })
    expect(cashback?.transactedAt.toISOString()).toBe('2026-03-15T00:00:00.000Z')
  })

  it('is empty for a config with no manual or recurring entries', async () => {
    vi.resetModules()
    const { manualTransactions } = await import('../../src/utils/helpers/manual-transactions')
    expect(manualTransactions).toEqual([])
  })
})

describe('manualTransactions totals', () => {
  it('holds exactly the expanded recurring entries plus the one-offs', async () => {
    const txs = await load(new Date(2026, 3, 20))
    expect(txs.map((t) => t.merchant)).toEqual(['MONTHLY FEE', 'MONTHLY FEE', 'MONTHLY FEE', 'CASHBACK'])
  })

  it('produces nothing for a start month in a later year, even an earlier month of it', async () => {
    const fees = (await load(new Date(2025, 5, 1))).filter((t) => t.merchant === 'MONTHLY FEE')
    expect(fees).toEqual([])
  })
})
