import type { ManualEntry, RecurringEntry } from '../utils/config'
import { toYearMonth } from '../utils/helpers'
import type { Minor } from '../utils/money'

/**
 * What the demo adds to the SMS ledger so the Manual and Schedules pages have
 * something to show. Dated relative to `now`, like the ledger, so they always
 * fall inside the six months it covers. All of it lands on the credit card,
 * whose SMS balances aren't reconciled (the limit isn't extracted), so no month
 * gains a discrepancy. Merchant strings are keys of the demo config's
 * merchantCategories, so keep the two in step.
 */

const minor = (pounds: number) => (pounds * 100) as Minor
const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Entries that never appear in an SMS: a fee, its reversal and a payment. All in the past. */
export function demoManualTransactions(now: Date): ManualEntry[] {
  const ago = (days: number) => day(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days))
  return [
    {
      type: 'debit',
      amount: minor(450),
      currency: 'EGP',
      account: 'credit_card',
      merchant: 'CARD ANNUAL FEE',
      date: ago(75),
    },
    {
      type: 'credit',
      amount: minor(150),
      currency: 'EGP',
      account: 'credit_card',
      merchant: 'FEE REVERSAL',
      date: ago(60),
    },
    {
      type: 'debit',
      amount: minor(600),
      currency: 'EGP',
      account: 'credit_card',
      merchant: 'STATIONERY SHOP',
      date: ago(20),
    },
  ]
}

/** A subscription billed to the card on the 4th of every month, from five months ago. */
export function demoSchedules(now: Date): RecurringEntry[] {
  return [
    {
      type: 'debit',
      amount: minor(129),
      currency: 'EGP',
      account: 'credit_card',
      merchant: 'CLOUDVAULT STORAGE',
      startYearMonth: toYearMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
      dayOfMonth: 4,
    },
  ]
}
