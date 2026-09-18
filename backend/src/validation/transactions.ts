import { z } from 'zod'
import type { TransactionFilters, TransactionType, TransferFilter } from '@wealthi/shared'
import { isSpendingCategory, SPENDING_CATEGORIES } from '../utils/categories'
import { ALL_ACCOUNTS, isAccountId } from '../utils/config'
import { isYearMonth } from '../utils/helpers'

/** A validated value, or the 400 message explaining why the input was rejected. */
export type Validated<T> = { value: T } | { error: string }

const TRANSFER_FILTERS: TransferFilter[] = ['only', 'exclude']
const TRANSACTION_TYPES: TransactionType[] = ['debit', 'credit']

/** Parses `input`, reporting only the first issue — one message per 400. */
function validate<T>(schema: z.ZodType<T>, input: unknown): Validated<T> {
  const result = schema.safeParse(input)
  return result.success ? { value: result.data } : { error: result.error.issues[0].message }
}

/** One query param: a string (not an array from `?x=a&x=b`) that passes `valid`, or `error`. */
const param = (valid: (value: string) => boolean, error: string) =>
  z.string({ error }).refine(valid, { error }).optional()

const accountParam = (name: string) => param(isAccountId, `${name} must be one of: ${ALL_ACCOUNTS.join(', ')}`)

/** Checked in declaration order, so the reported error is the first bad param. Unknown params are dropped. */
const TransactionFiltersSchema = z
  .object({
    yearMonth: param(isYearMonth, 'yearMonth must be in YYYY-MM format'),
    account: accountParam('account'),
    // Any string is a valid substring match.
    merchant: param(() => true, 'merchant must be a string'),
    type: z.enum(TRANSACTION_TYPES, { error: `type must be one of: ${TRANSACTION_TYPES.join(', ')}` }).optional(),
    transfer: z.enum(TRANSFER_FILTERS, { error: `transfer must be one of: ${TRANSFER_FILTERS.join(', ')}` }).optional(),
    counterAccount: accountParam('counterAccount'),
  })
  // Asking for a counter account while excluding transfers can never match a row.
  .refine((f) => !(f.counterAccount !== undefined && f.transfer === 'exclude'), {
    error: 'counterAccount cannot be combined with transfer=exclude',
  }) satisfies z.ZodType<TransactionFilters>

/** The validated GET /api/transactions filters, or the message for the first param that fails. */
export function parseTransactionFilters(query: unknown): Validated<TransactionFilters> {
  return validate(TransactionFiltersSchema, query)
}

const CategoryUpdateSchema = z.object({
  // Express types route params as `string | string[]`; a plain `:id` is always
  // a single value, so anything else is malformed.
  id: z.guid({ error: 'id must be a UUID' }),
  category: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'category is required (use null to clear it)' : 'category must be a string or null',
    })
    .nullable()
    // An empty/whitespace string clears the category, same as null.
    .transform((category) => category?.trim() || null)
    .refine((category) => category === null || isSpendingCategory(category), {
      error: `category must be null or one of: ${SPENDING_CATEGORIES.join(', ')}`,
    }),
})

/**
 * The transaction id and category from a PATCH /:id/category request.
 * `null` clears the category, and an empty/whitespace string means the same.
 */
export function parseCategoryUpdate(id: unknown, body: unknown): Validated<{ id: string; category: string | null }> {
  const category = typeof body === 'object' && body !== null && 'category' in body ? body.category : undefined
  return validate(CategoryUpdateSchema, { id, category })
}
