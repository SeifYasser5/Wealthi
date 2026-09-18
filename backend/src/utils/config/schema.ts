import { z } from 'zod'

/**
 * Personal data that must never be committed: your accounts and how bank SMS
 * map onto them, opening balances, the merchant category map, transfer rules
 * (which carry real names) and manual entries.
 *
 * Lives in backend/config/wealthi.json (gitignored). A committed
 * wealthi.example.json documents the shape — copy it to get started.
 *
 * The schema is the single definition: every config type below is inferred
 * from it, so the shape and its checks cannot drift apart.
 */

const YearMonth = z.string().regex(/^\d{4}-\d{2}$/, 'must be "YYYY-MM"')
const TxType = z.enum(['debit', 'credit'])
const Currency = z.enum(['EGP', 'USD'])
/** An account id; checked against `accounts` once the whole file has parsed. */
const AccountRef = z.string()

const Account = z.object({
  id: z.string().min(1),
  label: z.string(),
  currency: Currency,
})

/** A transaction that never appears in bank SMS (fee, reversal, adjustment). */
const ManualEntry = z.object({
  type: TxType,
  /** Always positive; direction is encoded in type */
  amount: z.number().nonnegative(),
  currency: Currency,
  account: AccountRef,
  /** Short description of what this is */
  merchant: z.string(),
  /** "YYYY-MM-DD" */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be "YYYY-MM-DD"'),
})

/** A manual entry repeated monthly from startYearMonth through the current month. */
const RecurringEntry = ManualEntry.omit({ date: true }).extend({
  /** "YYYY-MM", inclusive */
  startYearMonth: YearMonth,
  dayOfMonth: z.number().int().min(1).max(31),
})

/**
 * A deterministic routing rule for an internal transfer.
 *
 * Transfers between own accounts are not guessed by amount/date matching —
 * the bank SMS already tells us the destination through the account the leg
 * lands on plus the merchant string. Each rule maps one such (account, leg
 * direction, merchant) signature to the own account on the other side.
 */
const TransferRule = z.object({
  /** Human-readable id, for debugging/logging only */
  id: z.string(),
  /** Which account's SMS this rule applies to */
  account: AccountRef,
  /** Which leg this matches — debit = money out, credit = money in */
  type: TxType,
  /**
   * Anchored merchant match. Omit to match any merchant on this account+type.
   * Kept strict on purpose: a different merchant string is a different rule,
   * not a looser pattern.
   */
  merchant: z.string().optional(),
  /** The own account on the other side of the transfer */
  counterAccount: AccountRef,
})

/**
 * A CSV file (or one file per month) of transactions that never arrive by SMS.
 * See utils/helpers/csv-import.ts for how rows become transactions.
 */
const CsvImport = z
  .object({
    /** Human-readable id, used in error messages */
    id: z.string(),
    /**
     * Path relative to backend/. May contain {yearMonth}, {year} and {month},
     * e.g. "data/{yearMonth}/usd.csv".
     */
    file: z.string().min(1),
    /** "YYYY-MM", inclusive — first month the file exists for */
    from: YearMonth,
    /** "YYYY-MM", inclusive. Omit to keep importing through the current month. */
    to: YearMonth.optional(),
    /** Cell separator, default "," */
    delimiter: z.string().length(1).optional(),
    /** Own account every row lands on */
    account: AccountRef,
    /** Set when every row is an internal transfer from/to this own account */
    counterAccount: AccountRef.optional(),
    /**
     * CSV header name per field. `amount` is required, plus either `date`
     * ("YYYY-MM-DD…") or `day` (day of the month the file belongs to).
     */
    columns: z.object({
      amount: z.string(),
      date: z.string().optional(),
      day: z.string().optional(),
      type: z.string().optional(),
      currency: z.string().optional(),
      merchant: z.string().optional(),
    }),
    /** Fixed values for fields with no column, or for empty cells in one */
    values: z
      .object({
        type: TxType.optional(),
        currency: Currency.optional(),
        merchant: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((c, ctx) => {
    if (c.to !== undefined && c.to < c.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'must not be before from' })
    }
    if ((c.columns.date === undefined) === (c.columns.day === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['columns'], message: 'set exactly one of columns.date or columns.day' })
    }
    if (c.columns.currency === undefined && c.values?.currency === undefined) {
      ctx.addIssue({ code: 'custom', message: 'set columns.currency or values.currency' })
    }
  })

export const WealthiConfigSchema = z
  .object({
    /**
     * chat.db `handle.id` of each bank's SMS sender — the display name or phone
     * number your bank sends from. Only messages from these handles are imported.
     */
    bankSenders: z.array(z.string().min(1)).min(1),
    accounts: z.array(Account).min(1),
    /**
     * Parser source → own account. Parsers emit a bank-level source such as
     * "adcb:card" or "adcb:account:<last 4 digits>"; see each parser for its keys.
     */
    accountSources: z.record(z.string(), AccountRef),
    /** Genesis balances, used for the first month with no earlier snapshot */
    openingBalances: z.record(AccountRef, z.number()),
    /** Merchant name as printed by the bank → category label */
    merchantCategories: z.record(z.string(), z.string()),
    /** Categories offered by the UI that no merchant maps to yet */
    extraCategories: z.array(z.string()),
    transferRules: z.array(TransferRule),
    recurringTransactions: z.array(RecurringEntry),
    manualTransactions: z.array(ManualEntry),
    /** Optional; defaults to none */
    csvImports: z.array(CsvImport).default([]),
  })
  .superRefine((config, ctx) => {
    // Cross-references: every account named anywhere must be declared in `accounts`.
    const ids = new Set<string>()
    config.accounts.forEach((a, i) => {
      if (ids.has(a.id))
        ctx.addIssue({ code: 'custom', path: ['accounts', i, 'id'], message: `duplicate id "${a.id}"` })
      ids.add(a.id)
    })

    const check = (id: string | undefined, ...path: PropertyKey[]) => {
      if (id !== undefined && !ids.has(id)) ctx.addIssue({ code: 'custom', path, message: `unknown account "${id}"` })
    }
    for (const [source, id] of Object.entries(config.accountSources)) check(id, 'accountSources', source)
    for (const id of Object.keys(config.openingBalances)) check(id, 'openingBalances', id)
    config.transferRules.forEach((r, i) => {
      check(r.account, 'transferRules', i, 'account')
      check(r.counterAccount, 'transferRules', i, 'counterAccount')
    })
    config.recurringTransactions.forEach((e, i) => check(e.account, 'recurringTransactions', i, 'account'))
    config.manualTransactions.forEach((e, i) => check(e.account, 'manualTransactions', i, 'account'))
    config.csvImports.forEach((c, i) => {
      check(c.account, 'csvImports', i, 'account')
      check(c.counterAccount, 'csvImports', i, 'counterAccount')
    })

    for (const id of ids) {
      if (config.openingBalances[id] === undefined) {
        ctx.addIssue({ code: 'custom', path: ['openingBalances', id], message: 'missing opening balance' })
      }
    }
  })

export type WealthiConfig = z.infer<typeof WealthiConfigSchema>
export type ManualEntry = z.infer<typeof ManualEntry>
export type RecurringEntry = z.infer<typeof RecurringEntry>
export type TransferRule = z.infer<typeof TransferRule>
export type CsvImport = z.infer<typeof CsvImport>
