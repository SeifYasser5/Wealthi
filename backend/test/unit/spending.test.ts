import { describe, expect, it } from 'vitest'
import { buildSpendingBreakdown } from '../../src/services/spending'
import type { SpendingTransaction } from '../../src/utils/types'

let n = 0
const tx = (merchant: string | null, amount: number, category: string | null = null): SpendingTransaction => ({
  id: `t${++n}`,
  merchant,
  amount,
  account: 'card',
  category,
  transactedAt: new Date('2026-01-10T12:00:00Z'),
})

describe('buildSpendingBreakdown', () => {
  it('is empty for a month with no spending', () => {
    expect(buildSpendingBreakdown('2026-01', [])).toEqual({
      yearMonth: '2026-01',
      grandTotal: 0,
      categories: [],
      largeTransactions: [],
      uncategorized: [],
    })
  })

  it('groups by category then merchant, largest first, rounding totals', () => {
    const r = buildSpendingBreakdown('2026-01', [
      tx('ACME GROCERS', 10.1),
      tx('ACME GROCERS', 20.2),
      tx('SOMEWHERE', 50, 'Groceries'),
      tx('BISTRO', 100, 'Dining'),
    ])
    expect(r.grandTotal).toBe(180.3)
    expect(r.categories).toEqual([
      { category: 'Dining', total: 100, merchants: [{ merchant: 'BISTRO', total: 100 }] },
      {
        category: 'Groceries',
        total: 80.3,
        merchants: [
          { merchant: 'SOMEWHERE', total: 50 },
          { merchant: 'ACME GROCERS', total: 30.3 },
        ],
      },
    ])
  })

  it('lists small uncategorized rows individually and rolls them into the Uncategorized bucket', () => {
    const small = tx(null, 1)
    const r = buildSpendingBreakdown('2026-01', [tx('BISTRO', 99, 'Dining'), small])
    expect(r.uncategorized).toEqual([
      { id: small.id, merchant: null, amount: 1, account: 'card', transactedAt: '2026-01-10T12:00:00.000Z', pct: 1 },
    ])
    expect(r.categories.find((c) => c.category === 'Uncategorized')).toEqual({
      category: 'Uncategorized',
      total: 1,
      merchants: [{ merchant: '(unknown)', total: 1 }],
    })
    expect(r.largeTransactions).toEqual([])
  })

  it('promotes an uncategorized row of 5%+ to its own line instead of the bucket', () => {
    const big = tx('MYSTERY', 5)
    const r = buildSpendingBreakdown('2026-01', [tx('BISTRO', 95, 'Dining'), big])
    expect(r.largeTransactions).toEqual([{ id: big.id, merchant: 'MYSTERY', amount: 5, account: 'card', pct: 5 }])
    expect(r.uncategorized).toEqual([])
    expect(r.categories.map((c) => c.category)).toEqual(['Dining'])
  })

  it('keeps a row just under 5% in the bucket', () => {
    const r = buildSpendingBreakdown('2026-01', [tx('BISTRO', 95.1, 'Dining'), tx('MYSTERY', 4.9)])
    expect(r.largeTransactions).toEqual([])
    expect(r.uncategorized).toHaveLength(1)
  })
})

describe('buildSpendingBreakdown with a zero total', () => {
  it('neither divides by zero nor promotes a zero-amount row', () => {
    const r = buildSpendingBreakdown('2026-01', [tx('FREEBIE', 0)])
    expect(r.grandTotal).toBe(0)
    expect(r.largeTransactions).toEqual([])
    expect(r.uncategorized).toEqual([expect.objectContaining({ merchant: 'FREEBIE', pct: 0 })])
  })
})
