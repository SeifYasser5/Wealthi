import { z } from 'zod'
import type {
  AccountRequest,
  AccountSourceRequest,
  AccountUpdateRequest,
  BankSenderRequest,
  Currency,
  TransactionType,
  TransferRuleRequest,
} from '@wealthi/shared'
import { numberToMinor } from '../utils/money'
import type { AccountInput, TransferRuleInput } from '../utils/types'
import { validate, type Validated } from './transactions'

const CURRENCIES: Currency[] = ['EGP', 'USD']
const TRANSACTION_TYPES: TransactionType[] = ['debit', 'credit']

/** Postgres INTEGER's ceiling: anything above can't be a stored id. */
const INT4_MAX = 2_147_483_647
const RULE_ID_ERROR = 'id must be a transfer rule id (a positive integer)'
// What parseMinor refuses: a third decimal place, or more than DECIMAL(12,2) holds.
const BALANCE_ERROR = 'openingBalance must have at most 2 decimal places and be less than 10,000,000,000 in size'

/** A transfer rule id in the path: digits only, so "1e3" or " 7" never become one. */
const RuleIdParamSchema = z
  .string({ error: RULE_ID_ERROR })
  .regex(/^\d{1,10}$/, { error: RULE_ID_ERROR })
  .transform(Number)
  .pipe(z.int().min(1, { error: RULE_ID_ERROR }).max(INT4_MAX, { error: RULE_ID_ERROR }))

const openingBalance = z.number({ error: 'openingBalance must be a number' }).transform((n, ctx) => {
  const parsed = numberToMinor(n)
  if (parsed.ok) return parsed.value
  ctx.addIssue({ code: 'custom', message: BALANCE_ERROR })
  return z.NEVER
})

const label = z
  .string({ error: 'label must be a string' })
  .trim()
  .min(1, { error: 'label is required' })
  .max(60, { error: 'label must be at most 60 characters' })

const ID_ERROR = 'id must be 1 to 40 letters, digits, "_" or "-"'
/** An account id: what every ledger row stores, so a plain token. */
const accountId = z.string({ error: ID_ERROR }).regex(/^[A-Za-z0-9_-]{1,40}$/, { error: ID_ERROR })

/** Checked in declaration order, so the reported error is the first bad field. */
const AccountRequestSchema = z.object(
  {
    id: accountId,
    label,
    currency: z.enum(CURRENCIES, { error: `currency must be one of: ${CURRENCIES.join(', ')}` }),
    openingBalance,
  },
  { error: 'body must be an account' },
) satisfies z.ZodType<AccountInput, AccountRequest>

const AccountUpdateSchema = z.object(
  { label, openingBalance },
  { error: 'body must be { label, openingBalance }' },
) satisfies z.ZodType<Pick<AccountInput, 'label' | 'openingBalance'>, AccountUpdateRequest>

const SourceSchema = z
  .string({ error: 'source must be a string' })
  .trim()
  .min(1, { error: 'source is required' })
  .max(100, { error: 'source must be at most 100 characters' })

const AccountSourceRequestSchema = z.object(
  {
    source: SourceSchema,
    account: z.string({ error: 'account is required' }).min(1, { error: 'account is required' }),
  },
  { error: 'body must be { source, account }' },
) satisfies z.ZodType<AccountSourceRequest, unknown>

const ruleAccount = (name: string) =>
  z.string({ error: `${name} is required` }).min(1, { error: `${name} is required` })

const TransferRuleRequestSchema = z
  .object(
    {
      account: ruleAccount('account'),
      type: z.enum(TRANSACTION_TYPES, { error: `type must be one of: ${TRANSACTION_TYPES.join(', ')}` }),
      // Not trimmed: merchant strings are exact, as the bank prints them. Empty means any.
      merchant: z
        .string({ error: 'merchant must be a string (empty matches any merchant)' })
        .max(100, { error: 'merchant must be at most 100 characters' }),
      counterAccount: ruleAccount('counterAccount'),
    },
    { error: 'body must be a transfer rule' },
  )
  .refine((r) => r.account !== r.counterAccount, {
    error: 'counterAccount must differ from account',
  }) satisfies z.ZodType<TransferRuleInput, TransferRuleRequest>

const SenderRequestSchema = z.object(
  {
    sender: z
      .string({ error: 'sender must be a string' })
      .trim()
      .min(1, { error: 'sender is required' })
      .max(100, { error: 'sender must be at most 100 characters' }),
  },
  { error: 'body must be { sender }' },
) satisfies z.ZodType<BankSenderRequest, unknown>

/** The account from a POST /api/accounts body, the opening balance in minor units. */
export function parseAccountRequest(body: unknown): Validated<AccountInput> {
  return validate(AccountRequestSchema, body)
}

/** The changes from a PUT /api/accounts/:id body. */
export function parseAccountUpdate(body: unknown): Validated<Pick<AccountInput, 'label' | 'openingBalance'>> {
  return validate(AccountUpdateSchema, body)
}

/** The mapping from a PUT /api/account-sources body. */
export function parseAccountSourceRequest(body: unknown): Validated<AccountSourceRequest> {
  return validate(AccountSourceRequestSchema, body)
}

/** The key from a /api/account-sources/:source path. */
export function parseSourceParam(source: unknown): Validated<string> {
  return validate(SourceSchema, source)
}

/** The rule from a POST /api/transfer-rules or PUT /api/transfer-rules/:id body. */
export function parseTransferRuleRequest(body: unknown): Validated<TransferRuleInput> {
  return validate(TransferRuleRequestSchema, body)
}

/** The id from a /api/transfer-rules/:id path. */
export function parseTransferRuleId(id: unknown): Validated<number> {
  return validate(RuleIdParamSchema, id)
}

/** The sender from a POST /api/bank-senders body. */
export function parseBankSenderRequest(body: unknown): Validated<string> {
  const parsed = validate(SenderRequestSchema, body)
  return 'error' in parsed ? parsed : { value: parsed.value.sender }
}

/** The sender from a /api/bank-senders/:sender path. */
export function parseSenderParam(sender: unknown): Validated<string> {
  return validate(
    z
      .string({ error: 'sender must be a string' })
      .min(1, { error: 'sender is required' })
      .max(100, { error: 'sender must be at most 100 characters' }),
    sender,
  )
}
