// Shared frontend helpers: display formatting, "YYYY-MM" month helpers
// and the pure data helpers the components and hooks use.

import type { AccountBalance, Currency, Transaction, TransactionType, TransferFilter } from '@wealthi/shared'

// ─── Currencies ──────────────────────────────────────────────────────────────

/** Every currency the UI totals by, in display order. The first is the fallback. */
export const CURRENCIES = ['EGP', 'USD'] as const satisfies readonly Currency[]

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Whole units with thousands separators — the one money format in the UI. */
export function money(amount: number): string {
  return Math.round(amount).toLocaleString()
}

/** "18 Feb 2026" — full date for the transaction ledger. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** "18 Feb" — compact date for rows already scoped to one month. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

/** "1 transaction" / "3 transactions". Pass `pluralForm` for irregular words. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Text color for a signed amount: green above zero, red below, plain at zero. */
export function amountColor(amount: number): string {
  if (amount > 0) return 'text-positive'
  if (amount < 0) return 'text-negative'
  return 'text-foreground'
}

// ─── Year-month ("YYYY-MM") ──────────────────────────────────────────────────

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const YEAR_MONTH_RE = /^\d{4}-\d{2}$/

export function isYearMonth(value: string): boolean {
  return YEAR_MONTH_RE.test(value)
}

/** A local-time date as "YYYY-MM". */
function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Current month in local time as "YYYY-MM". */
export function currentYearMonth(): string {
  return toYearMonth(new Date())
}

/** Shift a "YYYY-MM" string by a number of months (positive or negative). */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  // month is 1-based here; Date handles overflow/underflow across years.
  return toYearMonth(new Date(year, month - 1 + delta, 1))
}

/** "2026-06" -> "June 2026" for display. */
export function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return `${MONTHS[month - 1]} ${year}`
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export function isTransferFilter(value: string): value is TransferFilter {
  return value === 'only' || value === 'exclude'
}

export function isTransactionType(value: string): value is TransactionType {
  return value === 'debit' || value === 'credit'
}

// ─── Transactions ────────────────────────────────────────────────────────────

/** Signed net for one currency, or null when no transaction uses it. */
export function netByCurrency(txs: Transaction[], currency: Currency): number | null {
  const matching = txs.filter((tx) => tx.currency === currency)
  if (matching.length === 0) return null
  return matching.reduce((sum, tx) => sum + (tx.type === 'credit' ? tx.amount : -tx.amount), 0)
}

/** Differences below half a cent are rounding, not a real mismatch. */
const BALANCE_TOLERANCE = 0.005

/** True when a reported-vs-computed discrepancy is within rounding. */
export function isBalanced(discrepancy: number): boolean {
  return Math.abs(discrepancy) < BALANCE_TOLERANCE
}

/**
 * Signed sum of the per-row discrepancies (reported minus computed) for one
 * currency, or null when no row in that currency has both numbers to compare.
 * `computed` is the `buildComputedBalances` output, indexed alongside `txs`.
 */
export function discrepancyByCurrency(
  txs: Transaction[],
  computed: (number | null)[],
  currency: Currency,
): number | null {
  let total: number | null = null
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i]
    const base = computed[i]
    if (tx.currency !== currency || base == null || tx.reportedBalance == null) continue
    total = (total ?? 0) + (tx.reportedBalance - base)
  }
  return total
}

export function buildComputedBalances(transactions: Transaction[]): (number | null)[] {
  const out: (number | null)[] = new Array(transactions.length).fill(null)
  for (let i = transactions.length - 2; i >= 0; i--) {
    const tx = transactions[i]
    const older = transactions[i + 1]
    if (older.account !== tx.account) continue
    const base = older.reportedBalance ?? out[i + 1]
    if (base == null) continue
    out[i] = tx.type === 'credit' ? base + tx.amount : base - tx.amount
  }
  return out
}

// ─── Balances ────────────────────────────────────────────────────────────────

/** The numeric columns a row renders, whether it is one account or a currency total. */
export type RowValues = Pick<
  AccountBalance,
  | 'openingBalance'
  | 'credits'
  | 'debits'
  | 'transfersIn'
  | 'transfersOut'
  | 'closingBalance'
  | 'lastReportedBalance'
  | 'discrepancy'
>

/** Summed across a currency group; a total has no single reported balance to show. */
const SUMMED = ['openingBalance', 'credits', 'debits', 'transfersIn', 'transfersOut', 'closingBalance'] as const

export function sumGroup(group: AccountBalance[]): RowValues {
  const totals = { openingBalance: 0, credits: 0, debits: 0, transfersIn: 0, transfersOut: 0, closingBalance: 0 }
  let discrepancy: number | null = null

  for (const bal of group) {
    for (const key of SUMMED) totals[key] += bal[key]
    // Stays null only while every account in the group reports none.
    if (bal.discrepancy !== null) discrepancy = (discrepancy ?? 0) + bal.discrepancy
  }

  return { ...totals, lastReportedBalance: null, discrepancy }
}
