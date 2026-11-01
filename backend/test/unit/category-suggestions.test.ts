import { describe, expect, it } from 'vitest'
import { MAX_SUGGESTIONS, MIN_REPEATS, suggestCategories } from '../../src/services/category-suggestions'
import type { MerchantDebit } from '../../src/db/categories'
import type { Minor } from '../../src/utils/money'

const debit = (merchant: string, amount: number, currency: MerchantDebit['currency'] = 'EGP'): MerchantDebit => ({
  merchant,
  amount: amount as Minor,
  currency,
})
const times = (n: number, d: MerchantDebit) => Array.from({ length: n }, () => d)

describe('suggestCategories', () => {
  it('suggests only merchants with at least MIN_REPEATS debits', () => {
    const out = suggestCategories(
      [...times(MIN_REPEATS, debit('A', 100)), ...times(MIN_REPEATS - 1, debit('B', 100))],
      new Set(),
    )
    expect(out.map((s) => s.merchant)).toEqual(['A'])
  })

  it('lists amounts repeated MIN_REPEATS times on their own and counts the rest as others', () => {
    const out = suggestCategories(
      [...times(6, debit('A', 4500)), ...times(MIN_REPEATS, debit('A', 9900)), debit('A', 100), debit('A', 200)],
      new Set(),
    )
    expect(out).toEqual([
      {
        merchant: 'A',
        count: 13,
        amounts: [
          { amount: 45, currency: 'EGP', count: 6 },
          { amount: 99, currency: 'EGP', count: 5 },
        ],
        others: 2,
      },
    ])
  })

  it('does not merge the same amount in two currencies', () => {
    const out = suggestCategories([...times(3, debit('A', 100)), ...times(3, debit('A', 100, 'USD'))], new Set())
    expect(out).toEqual([{ merchant: 'A', count: 6, amounts: [], others: 6 }])
    const both = suggestCategories([...times(5, debit('A', 100)), ...times(5, debit('A', 100, 'USD'))], new Set())
    expect(both[0].amounts.map((a) => a.currency)).toEqual(['EGP', 'USD'])
  })

  it('skips mapped merchants, orders by count then name, and caps the list', () => {
    const debits = [
      ...times(8, debit('MAPPED', 1)),
      ...times(6, debit('B', 1)),
      ...times(6, debit('A', 1)),
      ...Array.from({ length: 12 }, (_, i) => times(5, debit(`M${i}`, 1))).flat(),
    ]
    const out = suggestCategories(debits, new Set(['MAPPED']))
    expect(out).toHaveLength(MAX_SUGGESTIONS)
    expect(out.slice(0, 2).map((s) => s.merchant)).toEqual(['A', 'B'])
    expect(out.some((s) => s.merchant === 'MAPPED')).toBe(false)
  })
})
