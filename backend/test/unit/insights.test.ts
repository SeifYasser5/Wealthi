import { describe, expect, it } from 'vitest'
import { buildInsights } from '../../src/services/insights'
import type { Minor } from '../../src/utils/money'
import type { InsightTransaction } from '../../src/utils/types'

let n = 0
// `amount` is in minor units (1010 is 10.10); the response is in major units.
const tx = (over: Partial<InsightTransaction> & Pick<InsightTransaction, 'amount'>): InsightTransaction => ({
  id: `t${++n}`,
  yearMonth: '2026-01',
  transactedAt: new Date('2026-01-10T12:00:00Z'),
  type: 'debit',
  currency: 'EGP',
  account: 'card',
  merchant: null,
  category: null,
  ...over,
})

/** The merchant map, as loadMerchantCategories() reads it from merchant_categories. */
const MERCHANTS = new Map([['ACME GROCERS', 'Groceries']])

describe('buildInsights', () => {
  it('is empty for an empty ledger, and names the uncategorized bucket', () => {
    expect(buildInsights([], MERCHANTS)).toEqual({ rows: [], uncategorized: 'Uncategorized' })
  })

  it('serializes each row with money in major units and an ISO timestamp', () => {
    const row = tx({ id: 'a', amount: 1010 as Minor, type: 'credit', currency: 'USD', account: 'savings_usd' })
    expect(buildInsights([row], MERCHANTS).rows).toEqual([
      {
        id: 'a',
        yearMonth: '2026-01',
        transactedAt: '2026-01-10T12:00:00.000Z',
        type: 'credit',
        amount: 10.1,
        currency: 'USD',
        account: 'savings_usd',
        merchant: null,
        category: 'Uncategorized',
      },
    ])
  })

  it('resolves each category: manual first, then the merchant map, then the bucket', () => {
    const rows = buildInsights(
      [
        tx({ amount: 100 as Minor, merchant: 'ACME GROCERS', category: 'Dining' }),
        tx({ amount: 100 as Minor, merchant: 'ACME GROCERS' }),
        tx({ amount: 100 as Minor, merchant: 'MYSTERY' }),
      ],
      MERCHANTS,
    ).rows
    expect(rows.map((r) => r.category)).toEqual(['Dining', 'Groceries', 'Uncategorized'])
  })

  it('keeps the order it was given', () => {
    const rows = buildInsights([tx({ id: 'x', amount: 1 as Minor }), tx({ id: 'y', amount: 2 as Minor })], MERCHANTS)
    expect(rows.rows.map((r) => r.id)).toEqual(['x', 'y'])
  })
})
