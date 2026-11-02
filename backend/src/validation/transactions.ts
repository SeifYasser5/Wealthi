import { z } from 'zod'
import type { Account, TransactionFilters, TransactionType, TransferFilter } from '@wealthi/shared'
import { isYearMonth } from '../utils/helpers'

/** The stored accounts a request may name, and the currency each is in. */
export type KnownAccounts = readonly Pick<Account, 'id' | 'currency'>[]

/** A validated value, or the 400 message explaining why the input was rejected. */
export type Validated<T> = { value: T } | { error: string }

const TRANSFER_FILTERS: TransferFilter[] = ['only', 'exclude']
const TRANSACTION_TYPES: TransactionType[] = ['debit', 'credit']

/** Parses `input`, reporting only the first issue — one message per 400. */
export function validate<T>(schema: z.ZodType<T>, input: unknown): Validated<T> {
  const result = schema.safeParse(input)
  return result.success ? { value: result.data } : { error: result.error.issues[0].message }
}

/** One query param: a string (not an array from `?x=a&x=b`) that passes `valid`, or `error`. */
const param = (valid: (value: string) => boolean, error: string) =>
  z.string({ error }).refine(valid, { error }).optional()

const accountParam = (name: string, accounts: KnownAccounts) =>
  param((id) => accounts.some((a) => a.id === id), `${name} must be one of: ${accounts.map((a) => a.id).join(', ')}`)

/** Checked in declaration order, so the reported error is the first bad param. Unknown params are dropped. */
const transactionFiltersSchema = (accounts: KnownAccounts) =>
  z
    .object({
      yearMonth: param(isYearMonth, 'yearMonth must be in YYYY-MM format'),
      account: accountParam('account', accounts),
      // Any string is a valid substring match.
      merchant: param(() => true, 'merchant must be a string'),
      type: z.enum(TRANSACTION_TYPES, { error: `type must be one of: ${TRANSACTION_TYPES.join(', ')}` }).optional(),
      transfer: z
        .enum(TRANSFER_FILTERS, { error: `transfer must be one of: ${TRANSFER_FILTERS.join(', ')}` })
        .optional(),
      counterAccount: accountParam('counterAccount', accounts),
    })
    // Asking for a counter account while excluding transfers can never match a row.
    .refine((f) => !(f.counterAccount !== undefined && f.transfer === 'exclude'), {
      error: 'counterAccount cannot be combined with transfer=exclude',
    }) satisfies z.ZodType<TransactionFilters>

/** The validated GET /api/transactions filters, or the message for the first param that fails. */
export function parseTransactionFilters(query: unknown, accounts: KnownAccounts): Validated<TransactionFilters> {
  return validate(transactionFiltersSchema(accounts), query)
}
