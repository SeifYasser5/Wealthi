import { describe, expect, it } from 'vitest'
import { MAX_SUGGESTIONS, MIN_MONTHS, suggestSchedules } from '../../src/services/schedule-suggestions'
import type { RecurringCandidate } from '../../src/db/schedules'
import type { Minor } from '../../src/utils/money'

const tx = (
  merchant: string,
  day: string,
  amount = 10000,
  account = 'checking',
  extra: Partial<RecurringCandidate> = {},
): RecurringCandidate => ({
  merchant,
  type: 'debit',
  amount: amount as Minor,
  currency: 'EGP',
  account,
  day,
  ...extra,
})
const monthly = (merchant: string, n: number, amount = 10000, account = 'checking') =>
  Array.from({ length: n }, (_, i) => tx(merchant, `2026-${String(i + 1).padStart(2, '0')}-05`, amount, account))

describe('suggestSchedules', () => {
  it('suggests a merchant charged once in at least MIN_MONTHS months', () => {
    expect(suggestSchedules(monthly('A', MIN_MONTHS), new Set()).map((s) => s.merchant)).toEqual(['A'])
    expect(suggestSchedules(monthly('A', MIN_MONTHS - 1), new Set())).toEqual([])
  })

  it('reports the accounts it landed in and how far the amount moved', () => {
    const out = suggestSchedules(
      [
        tx('NETFLIX', '2026-01-05', 10000, 'checking'),
        tx('NETFLIX', '2026-02-05', 12000, 'savings'),
        tx('NETFLIX', '2026-03-05', 11000, 'checking'),
        tx('NETFLIX', '2026-04-07', 11000, 'checking'),
      ],
      new Set(),
    )
    expect(out).toEqual([
      {
        merchant: 'NETFLIX',
        type: 'debit',
        currency: 'EGP',
        months: 4,
        accounts: [
          { account: 'checking', count: 3 },
          { account: 'savings', count: 1 },
        ],
        min: 100,
        max: 120,
        average: 110,
        spread: 18.18,
        lastDate: '2026-04-07',
        nextDate: '2026-05-07',
      },
    ])
  })

  it('reports no spread when every month had the same amount', () => {
    expect(suggestSchedules(monthly('A', 3), new Set())[0]).toMatchObject({ min: 100, max: 100, spread: 0 })
  })

  it('ignores months with several charges unless most months have one', () => {
    const busy = [...monthly('A', 3), tx('A', '2026-01-20'), tx('A', '2026-02-20')]
    expect(suggestSchedules(busy, new Set())).toEqual([])
    const mostly = [...monthly('B', 4), tx('B', '2026-01-20')]
    expect(suggestSchedules(mostly, new Set())[0]).toMatchObject({ merchant: 'B', months: 3 })
  })

  it('keeps direction and currency apart', () => {
    const mixed = [
      ...monthly('A', 2),
      ...Array.from({ length: 2 }, (_, i) => tx('A', `2026-0${i + 3}-05`, 1, 'x', { type: 'credit' })),
      ...Array.from({ length: 2 }, (_, i) => tx('A', `2026-0${i + 5}-05`, 1, 'x', { currency: 'USD' })),
    ]
    expect(suggestSchedules(mixed, new Set())).toEqual([])
  })

  it('starts the next occurrence on the same day, or the last day of a shorter month', () => {
    const out = suggestSchedules([tx('A', '2025-11-30'), tx('A', '2025-12-31'), tx('A', '2026-01-31')], new Set())
    expect(out[0].nextDate).toBe('2026-03-31')
  })

  it('rolls the year over for December', () => {
    const out = suggestSchedules([tx('A', '2025-10-12'), tx('A', '2025-11-12'), tx('A', '2025-12-12')], new Set())
    expect(out[0].nextDate).toBe('2026-01-12')
  })

  it('skips scheduled merchants, orders by months then name, and caps the list', () => {
    const rows = [
      ...monthly('SCHEDULED', 6),
      ...monthly('B', 4),
      ...monthly('A', 4),
      ...Array.from({ length: 12 }, (_, i) => monthly(`M${i}`, 3)).flat(),
    ]
    const out = suggestSchedules(rows, new Set(['SCHEDULED']))
    expect(out).toHaveLength(MAX_SUGGESTIONS)
    expect(out.slice(0, 2).map((s) => s.merchant)).toEqual(['A', 'B'])
    expect(out.some((s) => s.merchant === 'SCHEDULED')).toBe(false)
  })
})
