import { z } from 'zod'
import type { ManualTransactionRequest, TransactionType } from '@wealthi/shared'
import { numberToMinor } from '../utils/money'
import { isDay } from '../utils/helpers/schedule'
import type { ManualTransactionInput } from '../utils/types'
import { categoryId } from './categories'
import { validate, type KnownAccounts, type Validated } from './transactions'

const TRANSACTION_TYPES: TransactionType[] = ['debit', 'credit']

/** Postgres INTEGER's ceiling: anything above can't be a stored id. */
const INT4_MAX = 2_147_483_647
const ID_ERROR = 'id must be a manual transaction id (a positive integer)'
// What parseMinor refuses: a third decimal place, or more than DECIMAL(12,2) holds.
const AMOUNT_ERROR = 'amount must have at most 2 decimal places and be less than 10,000,000,000'

/** A manual transaction id in the path: digits only, so "1e3" or " 7" never become one. */
const IdParamSchema = z
  .string({ error: ID_ERROR })
  .regex(/^\d{1,10}$/, { error: ID_ERROR })
  .transform(Number)
  .pipe(z.int().min(1, { error: ID_ERROR }).max(INT4_MAX, { error: ID_ERROR }))

/** Checked in declaration order, so the reported error is the first bad field. */
const manualTransactionRequestSchema = (accounts: KnownAccounts) =>
  z
    .object(
      {
        type: z.enum(TRANSACTION_TYPES, { error: `type must be one of: ${TRANSACTION_TYPES.join(', ')}` }),
        amount: z
          .number({ error: 'amount must be a number' })
          .positive({ error: 'amount must be more than 0' })
          .transform((n, ctx) => {
            const parsed = numberToMinor(n)
            if (parsed.ok) return parsed.value
            ctx.addIssue({ code: 'custom', message: AMOUNT_ERROR })
            return z.NEVER
          }),
        account: z.string({ error: 'account is required' }).refine((id) => accounts.some((a) => a.id === id), {
          error: `account must be one of: ${accounts.map((a) => a.id).join(', ')}`,
        }),
        merchant: z
          .string({ error: 'merchant must be a string' })
          .trim()
          .min(1, { error: 'merchant is required' })
          .max(100, { error: 'merchant must be at most 100 characters' }),
        // Whether it names a stored category is the foreign key's to decide (db/manual-transactions.ts).
        categoryId: z.union([categoryId('categoryId'), z.null()], {
          error: (issue) =>
            issue.input === undefined
              ? 'categoryId is required (use null for none)'
              : 'categoryId must be a category id (a positive integer)',
        }),
        date: z
          .string({ error: 'date must be a date (YYYY-MM-DD)' })
          .refine(isDay, { error: 'date must be a date (YYYY-MM-DD)' }),
      },
      { error: 'body must be a manual transaction' },
    )
    // The currency is the account's: an entry can't book dollars to a pound account.
    .transform((m): ManualTransactionInput => ({
      ...m,
      currency: accounts.find((a) => a.id === m.account)!.currency,
    })) satisfies z.ZodType<ManualTransactionInput, ManualTransactionRequest>

/** The manual transaction from a POST /api/manual-transactions or PUT /api/manual-transactions/:id body. */
export function parseManualTransactionRequest(
  body: unknown,
  accounts: KnownAccounts,
): Validated<ManualTransactionInput> {
  return validate(manualTransactionRequestSchema(accounts), body)
}

/** The id from a /api/manual-transactions/:id path. */
export function parseManualTransactionId(id: unknown): Validated<number> {
  return validate(IdParamSchema, id)
}
