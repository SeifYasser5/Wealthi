import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  amountColor,
  buildComputedBalances,
  currentYearMonth,
  formatDate,
  formatDay,
  formatYearMonth,
  isBalanced,
  isTransactionType,
  isTransferFilter,
  isYearMonth,
  money,
  netByCurrency,
  plural,
  shiftYearMonth,
  sumGroup,
} from '../../src/utils/utils'
import { balance, tx } from '../fixtures'

afterEach(() => vi.useRealTimers())

describe('formatting', () => {
  it('money rounds to whole units with thousands separators', () => {
    expect(money(1234.5)).toBe('1,235')
    expect(money(-0.4)).toBe('-0')
    expect(money(0)).toBe('0')
  })

  it('formats dates, with a dash for none', () => {
    expect(formatDate('2026-02-18T12:00:00.000Z')).toBe('Feb 18, 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDay('2026-02-18T12:00:00.000Z')).toBe('Feb 18')
  })

  it('pluralises, with an irregular form when given', () => {
    expect(plural(1, 'transaction')).toBe('1 transaction')
    expect(plural(0, 'transaction')).toBe('0 transactions')
    expect(plural(2, 'category', 'categories')).toBe('2 categories')
  })

  it('colours a signed amount', () => {
    expect(amountColor(0.01)).toBe('text-positive')
    expect(amountColor(-0.01)).toBe('text-negative')
    expect(amountColor(0)).toBe('text-foreground')
  })
})

describe('year-month', () => {
  it('validates "YYYY-MM"', () => {
    expect(isYearMonth('2026-01')).toBe(true)
    expect(isYearMonth('2026-1')).toBe(false)
    expect(isYearMonth('2026-01-01')).toBe(false)
  })

  it('reads the current month in local time', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 11, 31, 23, 59) })
    expect(currentYearMonth()).toBe('2026-12')
  })

  it('shifts across year boundaries both ways', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftYearMonth('2026-05', 0)).toBe('2026-05')
    expect(shiftYearMonth('2026-05', -17)).toBe('2024-12')
  })

  it('formats a month for display', () => {
    expect(formatYearMonth('2026-06')).toBe('June 2026')
    expect(formatYearMonth('2025-01')).toBe('January 2025')
    expect(formatYearMonth('2025-12')).toBe('December 2025')
  })
})

describe('filter guards', () => {
  it('accept only known values', () => {
    expect(['only', 'exclude', 'all', ''].map(isTransferFilter)).toEqual([true, true, false, false])
    expect(['debit', 'credit', 'transfer', ''].map(isTransactionType)).toEqual([true, true, false, false])
  })
})

describe('netByCurrency', () => {
  it('sums credits minus debits in one currency, or null when there are none', () => {
    const txs = [
      tx({ type: 'credit', amount: 100 }),
      tx({ type: 'debit', amount: 30 }),
      tx({ type: 'credit', amount: 7, currency: 'USD' }),
    ]
    expect(netByCurrency(txs, 'EGP')).toBe(70)
    expect(netByCurrency(txs, 'USD')).toBe(7)
    expect(netByCurrency([], 'EGP')).toBeNull()
  })
})

describe('isBalanced', () => {
  it('treats anything under half a cent as balanced', () => {
    expect(isBalanced(0)).toBe(true)
    expect(isBalanced(0.0049)).toBe(true)
    expect(isBalanced(-0.0049)).toBe(true)
    expect(isBalanced(0.005)).toBe(false)
    expect(isBalanced(-1)).toBe(false)
  })
})

describe('buildComputedBalances', () => {
  it('derives each row from the older row of the same account, newest first', () => {
    const rows = [
      tx({ type: 'debit', amount: 10, account: 'a' }), // from 90 → 80
      tx({ type: 'credit', amount: 40, account: 'a' }), // from reported 50 → 90
      tx({ type: 'debit', amount: 5, account: 'a', reportedBalance: 50 }), // oldest: nothing to derive from
    ]
    expect(buildComputedBalances(rows)).toEqual([80, 90, null])
  })

  it('prefers the older row’s reported balance over its computed one', () => {
    const rows = [
      tx({ type: 'debit', amount: 10, account: 'a' }),
      tx({ type: 'credit', amount: 40, account: 'a', reportedBalance: 1000 }),
      tx({ type: 'debit', amount: 5, account: 'a', reportedBalance: 50 }),
    ]
    expect(buildComputedBalances(rows)).toEqual([990, 90, null])
  })

  it('stops at an account change or when there is no base', () => {
    const rows = [
      tx({ type: 'debit', amount: 1, account: 'a' }),
      tx({ type: 'debit', amount: 1, account: 'b', reportedBalance: 100 }),
      tx({ type: 'debit', amount: 1, account: 'b' }),
    ]
    expect(buildComputedBalances(rows)).toEqual([null, null, null])
    expect(buildComputedBalances([])).toEqual([])
  })
})

describe('sumGroup', () => {
  it('sums the money columns and discrepancies, and never shows a reported balance', () => {
    const total = sumGroup([
      balance({
        account: 'a',
        openingBalance: 1,
        credits: 2,
        debits: 3,
        transfersIn: 4,
        transfersOut: 5,
        closingBalance: 6,
        lastReportedBalance: 9,
        discrepancy: 1,
      }),
      balance({
        account: 'b',
        openingBalance: 10,
        credits: 20,
        debits: 30,
        transfersIn: 40,
        transfersOut: 50,
        closingBalance: 60,
        discrepancy: null,
      }),
      balance({ account: 'c', discrepancy: -3 }),
    ])
    expect(total).toEqual({
      openingBalance: 11,
      credits: 22,
      debits: 33,
      transfersIn: 44,
      transfersOut: 55,
      closingBalance: 66,
      lastReportedBalance: null,
      discrepancy: -2,
    })
  })

  it('keeps the discrepancy null when no account reports one', () => {
    expect(sumGroup([balance({ account: 'a' })]).discrepancy).toBeNull()
    expect(sumGroup([]).discrepancy).toBeNull()
  })
})
