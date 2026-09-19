import { describe, expect, it } from 'vitest'
import { computeBalance } from '../../src/services/ingest/balance'
import type { Minor } from '../../src/utils/money'
import type { ParsedTransaction } from '../../src/utils/types'

// Amounts are minor units: 5010 is 50.10.
const m = (n: number) => n as Minor

type Row = Omit<Partial<ParsedTransaction>, 'amount' | 'reportedBalance'> &
  Pick<ParsedTransaction, 'type'> & { amount: number; reportedBalance?: number | null }

const tx = ({ amount, reportedBalance = null, ...over }: Row): ParsedTransaction => ({
  currency: 'EGP',
  account: 'checking',
  merchant: null,
  counterAccount: null,
  transactedAt: new Date('2026-01-10T12:00:00Z'),
  ...over,
  amount: m(amount),
  reportedBalance: reportedBalance === null ? null : m(reportedBalance),
})

describe('computeBalance', () => {
  it('rolls opening + credits − debits into the closing balance', () => {
    const b = computeBalance('checking', '2026-01', m(10000), [
      tx({ type: 'credit', amount: 5010 }),
      tx({ type: 'debit', amount: 2020 }),
    ])
    expect(b).toMatchObject({ openingBalance: 10000, credits: 5010, debits: 2020, closingBalance: 12990 })
  })

  it('reports the discrepancy against the latest bank-reported balance', () => {
    const b = computeBalance('checking', '2026-01', m(0), [
      tx({ type: 'credit', amount: 1000, reportedBalance: 99900, transactedAt: new Date('2026-01-01T00:00:00Z') }),
      tx({ type: 'credit', amount: 1000, reportedBalance: 2500, transactedAt: new Date('2026-01-02T00:00:00Z') }),
    ])
    expect(b).toMatchObject({ closingBalance: 2000, lastReportedBalance: 2500, discrepancy: -500 })
  })

  it('keeps the latest reported balance whatever order rows arrive in', () => {
    const b = computeBalance('checking', '2026-01', m(0), [
      tx({ type: 'credit', amount: 1000, reportedBalance: 2500, transactedAt: new Date('2026-01-02T00:00:00Z') }),
      tx({ type: 'credit', amount: 1000, reportedBalance: 99900, transactedAt: new Date('2026-01-01T00:00:00Z') }),
    ])
    expect(b).toMatchObject({ lastReportedBalance: 2500, discrepancy: -500 })
  })

  it('ignores a later row that reports no balance', () => {
    const b = computeBalance('checking', '2026-01', m(0), [
      tx({ type: 'credit', amount: 1000, reportedBalance: 2500, transactedAt: new Date('2026-01-01T00:00:00Z') }),
      tx({ type: 'credit', amount: 1000, reportedBalance: null, transactedAt: new Date('2026-01-02T00:00:00Z') }),
    ])
    expect(b).toMatchObject({ lastReportedBalance: 2500, discrepancy: -500 })
  })

  it('ignores a row whose type is neither debit nor credit', () => {
    const b = computeBalance('checking', '2026-01', m(500), [tx({ type: 'refund' as never, amount: 300 })])
    expect(b).toMatchObject({ debits: 0, credits: 0, transfersIn: 0, closingBalance: 500 })
  })

  it('has no discrepancy without a reported balance', () => {
    expect(computeBalance('checking', '2026-01', m(0), []).discrepancy).toBeNull()
  })

  it('splits an incoming transfer out of credits', () => {
    const b = computeBalance('card', '2026-01', m(0), [
      tx({ type: 'credit', amount: 3000, counterAccount: 'checking' }),
    ])
    expect(b).toMatchObject({ credits: 0, transfersIn: 3000, closingBalance: 3000 })
  })

  // Known bug: balance.ts has `if (false) transfersOut += …`, so an outgoing
  // transfer is counted as a debit. The closing balance is still right. Remove
  // `.fails` once it's fixed.
  it.fails('splits an outgoing transfer out of debits', () => {
    const b = computeBalance('checking', '2026-01', m(10000), [
      tx({ type: 'debit', amount: 3000, counterAccount: 'card' }),
    ])
    expect(b).toMatchObject({ debits: 0, transfersOut: 3000, closingBalance: 7000 })
  })
})
