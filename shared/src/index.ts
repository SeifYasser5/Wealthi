// The HTTP contract between backend and frontend: what each /api endpoint
// accepts and returns, as it looks on the wire (JSON — dates are ISO strings).
//
// Types only. Nothing here may emit runtime code, so both sides can
// `import type` it without a build step or CJS/ESM interop. Backend-internal
// types (DB rows, decoded SMS, import staging) stay in backend/src/utils/types.ts.

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * One of your own accounts. The set is configured, not hardcoded: see
 * `accounts` in backend/config/wealthi.json, served by GET /api/accounts.
 */
export type AccountId = string

export type Currency = 'EGP' | 'USD'

/** The direction of a transaction: debit = money out, credit = money in. */
export type TransactionType = 'debit' | 'credit'

/**
 * Transfer-ness filter. Internal transfers are exactly the rows with a non-null
 * `counterAccount`.
 */
export type TransferFilter = 'only' | 'exclude'

/** Every endpoint reports failure as this body with a non-2xx status. */
export interface ApiError {
  error: string
}

// ─── GET /api/accounts ───────────────────────────────────────────────────────

/** One of your own accounts. The id is what transactions and balances store. */
export interface Account {
  id: AccountId
  label: string
  currency: Currency
}

export interface AccountsResponse {
  /** Your accounts in display order, with the label and currency the UI shows. */
  accounts: Account[]
}

// ─── GET /api/transactions ───────────────────────────────────────────────────

/** Query params for the transaction listing. All optional and AND-combined. */
export interface TransactionFilters {
  yearMonth?: string
  account?: AccountId
  /** Case-insensitive substring match against the merchant name. */
  merchant?: string
  /** Direction: 'debit' for money out, 'credit' for money in. */
  type?: TransactionType
  /** 'only' keeps internal transfers; 'exclude' keeps everything else. */
  transfer?: TransferFilter
  /** The other side of an internal transfer. Implies `transfer: 'only'`. */
  counterAccount?: AccountId
}

/** A transaction as serialized over JSON. */
export interface Transaction {
  id: string
  /** "YYYY-MM" */
  yearMonth: string
  type: TransactionType
  /** Always positive — direction is encoded in `type` */
  amount: number
  currency: Currency
  account: AccountId
  /** Merchant or payee name as printed by the bank */
  merchant: string | null
  /** Id of the manually assigned category; null means the merchant map decides. */
  categoryId: number | null
  /** That category's name, or null with `categoryId`. */
  category: string | null
  /** Own account on the other side when this leg is an internal transfer. */
  counterAccount: AccountId | null
  /** Bank-reported available balance following this transaction */
  reportedBalance: number | null
  /** ISO timestamp */
  transactedAt: string
  /** ISO timestamp */
  createdAt: string
  /** True exactly when `counterAccount` is set. */
  isTransfer: boolean
  /**
   * The bank SMS this row was parsed from, cleaned of invisible characters.
   * Null for rows with no message behind them (manual and CSV entries).
   */
  rawText: string | null
  /** The schedule this row is an occurrence of (/api/schedules); null for every other row. */
  scheduleId: number | null
}

export interface TransactionsResponse {
  count: number
  transactions: Transaction[]
}

// ─── PATCH /api/transactions/:id/category ────────────────────────────────────

export interface UpdateCategoryRequest {
  /** A stored category's id (GET /api/categories), or null to fall back to the merchant map. */
  categoryId: number | null
}

export interface UpdateCategoryResponse {
  transaction: Transaction
}

// ─── /api/categories ─────────────────────────────────────────────────────────

/** A category a transaction can be assigned to, as listed on the Categories page. */
export interface Category {
  id: number
  name: string
  /** Its place in every category list, from 0; PUT /api/categories/order sets it. */
  position: number
  /** Monthly allowance for the Budget view, or null when none is set. */
  budget: number | null
  /** Transactions assigned it by hand. */
  transactionCount: number
  /** Schedules that give it to their occurrences. */
  scheduleCount: number
  /** Merchants mapped to it, alphabetically. */
  merchants: string[]
}

/**
 * GET /api/categories, and the answer to a reorder or a merchant mapping: every
 * category in order. A category can be deleted only while it has no
 * transactions and no merchants.
 */
export interface CategoriesResponse {
  categories: Category[]
  /** Label the spending breakdown uses for rows with no category; not a category itself. */
  uncategorized: string
}

/** One amount a suggested merchant was charged again and again. */
export interface SuggestedAmount {
  amount: number
  currency: Currency
  /** How many debits had exactly this amount. */
  count: number
}

/** A merchant that keeps coming back, offered as a category of its own. */
export interface CategorySuggestion {
  /** Exactly as printed by the bank; also the name the category would take. */
  merchant: string
  /** Debits at this merchant, across the whole ledger. */
  count: number
  /** Amounts repeated often enough to stand alone, most frequent first. */
  amounts: SuggestedAmount[]
  /** Debits whose amount repeated too rarely to stand alone; 0 when every one did. */
  others: number
}

/** GET /api/categories/suggestions — the busiest unmapped merchants, most debits first. */
export interface CategorySuggestionsResponse {
  suggestions: CategorySuggestion[]
  /** Fewest debits a merchant needs to be suggested, and an amount to stand alone. */
  minRepeats: number
}

/** POST /api/categories (appended last), and PATCH /api/categories/:id (renamed). */
export interface CategoryRequest {
  name: string
}

export interface CategoryResponse {
  category: Category
}

/** PUT /api/categories/order — every category id, in the new order. */
export interface ReorderCategoriesRequest {
  ids: number[]
}

/** PUT /api/categories/:id/budget — the monthly allowance, or null to clear it. */
export interface CategoryBudgetRequest {
  budget: number | null
}

// ─── PUT /api/merchant-categories ────────────────────────────────────────────

/**
 * Maps a merchant to a category, moving it if it was mapped to another, or
 * unmaps it with null. Answered with CategoriesResponse.
 */
export interface MerchantCategoryRequest {
  /** Exactly as printed by the bank */
  merchant: string
  categoryId: number | null
}

// ─── /api/schedules ──────────────────────────────────────────────────────────

/** How often a schedule repeats, in units of its `interval`. */
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * POST /api/schedules (create) and PUT /api/schedules/:id (replace). The
 * currency is the account's. Dates are "YYYY-MM-DD", local time.
 */
export interface ScheduleRequest {
  type: TransactionType
  /** Always positive, at most 2 decimal places */
  amount: number
  account: AccountId
  merchant: string
  /** Given to every occurrence; null lets the merchant map decide. */
  categoryId: number | null
  frequency: Frequency
  /** Every `interval` days/weeks/months/years, from 1 */
  interval: number
  /** The first occurrence. Monthly and yearly ones fall on its day, or the month's last day when shorter. */
  startDate: string
  /** The last day an occurrence may fall on; null repeats indefinitely. */
  endDate: string | null
}

/**
 * A transaction the import adds by itself on every occurrence from its start
 * date through today. Edits apply to every occurrence at the next import.
 */
export interface Schedule extends ScheduleRequest {
  id: number
  currency: Currency
  /** The category's name, or null with `categoryId`. */
  category: string | null
  /** The first occurrence after today, or null once `endDate` has passed. */
  nextDate: string | null
  /** Occurrences stored in transactions by the last import. */
  transactionCount: number
}

/** GET /api/schedules: every schedule, by start date. */
export interface SchedulesResponse {
  schedules: Schedule[]
}

export interface ScheduleResponse {
  schedule: Schedule
}

// ─── /api/manual-transactions ────────────────────────────────────────────────

/**
 * POST /api/manual-transactions (create) and PUT /api/manual-transactions/:id
 * (replace). The currency is the account's. The date is "YYYY-MM-DD", local time.
 */
export interface ManualTransactionRequest {
  type: TransactionType
  /** Always positive, at most 2 decimal places */
  amount: number
  account: AccountId
  merchant: string
  /** Null lets the merchant map decide. */
  categoryId: number | null
  date: string
}

/**
 * A one-off transaction entered by hand. Every import copies it into the
 * ledger, so it outlives the rebuild; a change reaches the ledger at the next import.
 */
export interface ManualTransaction extends ManualTransactionRequest {
  id: number
  currency: Currency
  /** The category's name, or null with `categoryId`. */
  category: string | null
}

/** GET /api/manual-transactions: every manual transaction, newest first. */
export interface ManualTransactionsResponse {
  manualTransactions: ManualTransaction[]
}

export interface ManualTransactionResponse {
  manualTransaction: ManualTransaction
}

/** One account a suggested schedule's charges landed in, and how many. */
export interface RecurringAccount {
  account: AccountId
  count: number
}

/** A merchant that shows up once a month, offered as a monthly schedule. */
export interface ScheduleSuggestion {
  /** Exactly as printed by the bank. */
  merchant: string
  type: TransactionType
  currency: Currency
  /** Months in which it appeared exactly once. */
  months: number
  /** Accounts it was charged to, most used first. */
  accounts: RecurringAccount[]
  /** The amounts across those months; the average is rounded to the minor unit. */
  min: number
  max: number
  average: number
  /** (max − min) / average, as a percentage: 0 when every month had the same amount. */
  spread: number
  /** The most recent occurrence. */
  lastDate: string
  /** The day it would fall next month: where a schedule would start. */
  nextDate: string
}

/** GET /api/schedules/suggestions — merchants that repeat once a month and have no schedule, longest-running first. */
export interface ScheduleSuggestionsResponse {
  suggestions: ScheduleSuggestion[]
  /** Fewest once-a-month months a merchant needs to be suggested. */
  minMonths: number
}

// ─── GET /api/balances ───────────────────────────────────────────────────────

/** Computed balance summary for one account in one calendar month */
export interface AccountBalance {
  account: AccountId
  yearMonth: string
  openingBalance: number
  debits: number
  credits: number
  transfersIn: number
  transfersOut: number
  closingBalance: number
  /** Last bank-reported balance seen in SMS for this period */
  lastReportedBalance: number | null
  /** closingBalance − lastReportedBalance; null when lastReportedBalance is null */
  discrepancy: number | null
}

export interface BalancesResponse {
  yearMonth: string
  count: number
  balances: AccountBalance[]
}

// ─── GET /api/spending ───────────────────────────────────────────────────────

export interface MerchantRow {
  merchant: string
  total: number
}

export interface CategoryRow {
  category: string
  total: number
  merchants: MerchantRow[]
}

export interface LargeTransactionRow {
  id: string
  merchant: string | null
  amount: number
  account: AccountId
  pct: number
}

/** An uncategorized transaction, addressable by id so the UI can assign it a category. */
export interface UncategorizedTransactionRow {
  id: string
  merchant: string | null
  amount: number
  account: AccountId
  /** ISO timestamp */
  transactedAt: string
  pct: number
}

export interface SpendingResponse {
  yearMonth: string
  grandTotal: number
  categories: CategoryRow[]
  largeTransactions: LargeTransactionRow[]
  /** Uncategorized rows not already promoted into `largeTransactions`. */
  uncategorized: UncategorizedTransactionRow[]
}

// ─── GET /api/insights ───────────────────────────────────────────────────────

/**
 * One non-transfer transaction reduced to what a chart groups and sums by, with
 * its category already resolved (manual, else the merchant map, else the
 * uncategorized bucket), so the Insights page never resolves one itself.
 */
export interface InsightRow {
  id: string
  /** "YYYY-MM" */
  yearMonth: string
  /** ISO timestamp */
  transactedAt: string
  type: TransactionType
  /** Always positive — direction is encoded in `type` */
  amount: number
  currency: Currency
  account: AccountId
  /** Merchant or payee name as printed by the bank */
  merchant: string | null
  /** The resolved category's name, or `uncategorized` */
  category: string
}

/** GET /api/insights — the whole ledger minus internal transfers, oldest first. */
export interface InsightsResponse {
  rows: InsightRow[]
  /** The name `category` takes when nothing resolved one; not a category itself. */
  uncategorized: string
}

// ─── POST /api/import ────────────────────────────────────────────────────────

/** A bank SMS the import read but could not turn into a transaction. */
export interface ImportParseError {
  sender: string
  /** ISO timestamp the message arrived */
  messageDate: string
  /** The SMS text, cleaned of invisible characters. */
  text: string
  /** Why it was rejected, e.g. "no enabled pattern matched". */
  reason: string
}

/**
 * The outcome of one import. `skipped` means there was no chat.db at `source`,
 * so the stored ledger was left untouched. A failed import is a 500 ApiError.
 */
export interface ImportResponse {
  status: 'completed' | 'skipped'
  /** The chat.db path the import read, or "demo ledger" in demo mode. */
  source: string
  /** ISO timestamp */
  finishedAt: string
  durationMs: number
  /** Months of balances recomputed. */
  months: number
  /**
   * Transactions stored. 0 on a completed import means chat.db held no bank
   * transactions, and the stored ledger was kept rather than emptied.
   */
  totalStored: number
  parseErrors: ImportParseError[]
}

// ─── /api/patterns ───────────────────────────────────────────────────────────

/** `pending` waits for review on the Learn page; only `enabled` patterns parse. */
export type PatternStatus = 'pending' | 'enabled' | 'disabled'

/** debit/credit, or by-keyword when a `{direction:TEXT}` slot holds the direction word. */
export type PatternType = 'debit' | 'credit' | 'by-keyword'

/** A learned SMS template. */
export interface PatternRow {
  /** "<bank>:<hash>" — stable across learn runs */
  id: string
  bank: string
  status: PatternStatus
  type: PatternType
  /** Literal tokens and `{role:TYPE}` slots, e.g. "charged {currency:CUR} {amount:NUM} at {merchant:TEXT}" */
  pattern: string
  /** Why learn labelled it this way */
  reason: string
  /** Things to check before enabling; empty when there are none */
  review: string[]
  /** Messages it matched in the latest learn run */
  messages: number
  /** Not produced by the latest learn run of its bank */
  missing: boolean
  /** ISO timestamp of the run that first found it */
  learnedAt: string
}

/** GET /api/patterns, and the answer to PATCH /api/patterns: every stored pattern. */
export interface PatternsResponse {
  patterns: PatternRow[]
}

/**
 * PATCH /api/patterns — sets these patterns' status. The Learn page's review
 * sends every pending pattern it showed, split by what you selected; a toggle
 * in the Enabled / Disabled tabs sends one id.
 */
export interface UpdatePatternsRequest {
  enable?: string[]
  disable?: string[]
}

/**
 * The outcome of POST /api/patterns/learn. `skipped` means there was no chat.db
 * at `source`, so nothing was learned. A failed run is a 500 ApiError.
 */
export interface LearnResponse {
  status: 'completed' | 'skipped'
  /** The chat.db path learn read, or "demo ledger" in demo mode. */
  source: string
  /** ISO timestamp */
  finishedAt: string
  durationMs: number
  /** Bank SMS read */
  messages: number
  /** Messages whose text could not be decoded, left out of learning */
  undecodable: number
  /** Patterns this run found that were not stored yet; they are now pending review. */
  added: number
}
