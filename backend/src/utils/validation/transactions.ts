import type { TransactionFilters, TransactionType, TransferFilter } from '@wealthi/shared'
import { isSpendingCategory, SPENDING_CATEGORIES } from '../categories'
import { ALL_ACCOUNTS, isAccountId } from '../config'
import { isYearMonth } from '../helpers'

/** A validated value, or the 400 message explaining why the input was rejected. */
export type Validated<T> = { value: T } | { error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRANSFER_FILTERS: TransferFilter[] = ['only', 'exclude']
const TRANSACTION_TYPES: TransactionType[] = ['debit', 'credit']

/**
 * One accepted query param: how to validate it, and what to say when it fails.
 * Checked in declaration order, so the reported error is the first bad param.
 */
const FILTERS: Record<keyof TransactionFilters, { valid: (value: string) => boolean; error: string }> = {
  yearMonth: { valid: isYearMonth, error: 'yearMonth must be in YYYY-MM format' },
  account: { valid: isAccountId, error: `account must be one of: ${ALL_ACCOUNTS.join(', ')}` },
  // Any string is a valid substring match; the typeof check below is the whole rule.
  merchant: { valid: () => true, error: 'merchant must be a string' },
  type: {
    valid: (v) => TRANSACTION_TYPES.includes(v as TransactionType),
    error: `type must be one of: ${TRANSACTION_TYPES.join(', ')}`,
  },
  transfer: {
    valid: (v) => TRANSFER_FILTERS.includes(v as TransferFilter),
    error: `transfer must be one of: ${TRANSFER_FILTERS.join(', ')}`,
  },
  counterAccount: { valid: isAccountId, error: `counterAccount must be one of: ${ALL_ACCOUNTS.join(', ')}` },
}

/** The validated GET /api/transactions filters, or the message for the first param that fails. */
export function parseTransactionFilters(query: Record<string, unknown>): Validated<TransactionFilters> {
  const filters: Record<string, string> = {}

  for (const [key, { valid, error }] of Object.entries(FILTERS)) {
    const raw = query[key]
    if (raw === undefined) continue
    if (typeof raw !== 'string' || !valid(raw)) return { error }
    filters[key] = raw
  }

  // Asking for a counter account while excluding transfers can never match a row.
  if (filters.counterAccount !== undefined && filters.transfer === 'exclude') {
    return { error: 'counterAccount cannot be combined with transfer=exclude' }
  }

  // Every value was checked against its own validator above.
  return { value: filters as TransactionFilters }
}

/**
 * The transaction id and category from a PATCH /:id/category request.
 * `null` clears the category, and an empty/whitespace string means the same.
 */
export function parseCategoryUpdate(id: unknown, body: unknown): Validated<{ id: string; category: string | null }> {
  // Express types route params as `string | string[]`; a plain `:id` is always
  // a single value, so anything else is malformed.
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { error: 'id must be a UUID' }

  if (typeof body !== 'object' || body === null || !('category' in body)) {
    return { error: 'category is required (use null to clear it)' }
  }

  const { category } = body
  if (category !== null && typeof category !== 'string') {
    return { error: 'category must be a string or null' }
  }

  const next = category?.trim() || null
  if (next !== null && !isSpendingCategory(next)) {
    return { error: `category must be null or one of: ${SPENDING_CATEGORIES.join(', ')}` }
  }

  return { value: { id, category: next } }
}
