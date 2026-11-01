import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// manualTransactions is computed once, at import, from config — so each test
// loads it fresh.
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
  it('stages one-off entries as-is, bucketed by their date', async () => {
    const cashback = (await load(new Date(2026, 3, 1))).find((t) => t.merchant === 'CASHBACK')
    expect(cashback).toMatchObject({ type: 'credit', amount: 500, yearMonth: '2026-03', counterAccount: null })
    expect(cashback?.transactedAt.toISOString()).toBe('2026-03-15T00:00:00.000Z')
  })

  it('leaves recurringTransactions to the schedules table, which they only seed', async () => {
    const txs = await load(new Date(2026, 3, 20))
    expect(txs.map((t) => t.merchant)).toEqual(['CASHBACK'])
  })

  it('is empty for a config with no manual entries', async () => {
    vi.resetModules()
    const { manualTransactions } = await import('../../src/utils/helpers/manual-transactions')
    expect(manualTransactions).toEqual([])
  })
})
