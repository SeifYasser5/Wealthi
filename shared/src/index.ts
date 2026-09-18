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
  /** Manually assigned category; null means the backend merchant map decides. */
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
}

export interface TransactionsResponse {
  count: number
  transactions: Transaction[]
}

// ─── PATCH /api/transactions/:id/category ────────────────────────────────────

export interface UpdateCategoryRequest {
  /** One of GET /api/categories, or null to fall back to the merchant map. */
  category: string | null
}

export interface UpdateCategoryResponse {
  transaction: Transaction
}

// ─── GET /api/categories ─────────────────────────────────────────────────────

export interface CategoriesResponse {
  /** Assignable categories, alphabetically ordered — the exact set PATCH accepts. */
  categories: string[]
  /** Label the spending breakdown uses for rows with no category; not assignable. */
  uncategorized: string
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
