import type {
  Account,
  AccountBalance,
  AccountId,
  AccountSource,
  Category,
  CategorySuggestion,
  CategorySuggestionsResponse,
  Currency,
  Frequency,
  ImportParseError,
  ImportResponse,
  LearnResponse,
  ManualTransaction,
  PatternRow,
  PatternStatus,
  PatternsResponse,
  PatternType,
  Schedule,
  RecurringAccount,
  ScheduleRequest,
  ScheduleSuggestion,
  ScheduleSuggestionsResponse,
  TransactionType,
  TransferRule,
} from '@wealthi/shared'
import type { Minor } from './money'

// Contract types shared with the frontend, re-exported so backend modules keep
// importing everything from here.
export type {
  Account,
  AccountBalance,
  AccountId,
  AccountSource,
  Category,
  CategorySuggestion,
  CategorySuggestionsResponse,
  Currency,
  Frequency,
  ImportParseError,
  ImportResponse,
  LearnResponse,
  ManualTransaction,
  PatternRow,
  PatternStatus,
  PatternsResponse,
  PatternType,
  Schedule,
  RecurringAccount,
  ScheduleRequest,
  ScheduleSuggestion,
  ScheduleSuggestionsResponse,
  TransactionType,
  TransferRule,
}

export interface DbRow {
  /** chat.db message.ROWID — monotonic insert order; the incremental import cursor. */
  rowid: bigint
  /** chat.db message.guid — stable per-message id used for insert-time dedup. */
  guid: string
  message_date: bigint
  text: string | null
  sender: string
  attributed_body: Buffer | null
}

/** RawMessage after attributedBody has been decoded — text is always present */
export interface DecodedMessage {
  rowid: bigint
  guid: string
  messageDate: Date
  text: string
  sender: string
}

interface BaseTransaction {
  /** Always positive — direction is encoded in `type` */
  amount: Minor
  currency: Currency
  account: AccountId
  /** Merchant or payee name as printed by the bank */
  merchant: string | null
  /**
   * Id of the manually assigned spending category. Absent/null on freshly
   * parsed rows — the spending breakdown then falls back to the merchant map.
   * Set through PATCH /api/transactions/:id/category.
   */
  categoryId?: number | null
  /**
   * Own account on the other side when this leg is an internal transfer; null
   * for ordinary spend/income. A non-null value is what marks a transaction as
   * a transfer — direction is still read from `type` (debit = out, credit = in).
   */
  counterAccount: AccountId | null
  /** Bank-reported available balance following this transaction */
  reportedBalance: Minor | null
  /** Timestamp from the SMS text (null when the SMS omits it) */
  transactedAt: Date
  messageGuid?: string | null
  sourceRowid?: bigint | null
  /**
   * The SMS body this row was parsed from, cleaned by sanitizeMessageText() so
   * it is the readable message and nothing else. Set only on the SMS path —
   * absent on manual/CSV rows, which have no message behind them.
   */
  rawText?: string | null
  /** The schedule this row is an occurrence of; absent/null on every other row. */
  scheduleId?: number | null
}

/**
 * A parsed transaction. Transfers are not a separate variant: an internal
 * transfer is a debit (money out) or credit (money in) that also carries a
 * non-null `counterAccount`. Test for one with `counterAccount !== null`.
 */
export type ParsedTransaction = BaseTransaction & { type: TransactionType }

/**
 * ParsedTransaction tagged with its calendar month — ready for DB insertion.
 * `messageGuid`/`sourceRowid` link an SMS-derived row back to its chat.db
 * message for dedup and cursor recovery; both are absent on manual/CSV rows,
 * which are never inserted through the SMS path.
 */
export type StagedTransaction = ParsedTransaction & {
  yearMonth: string
}

interface TransactionMeta {
  id: string
  yearMonth: string // "YYYY-MM"
  createdAt: Date
  /**
   * Derived, never persisted: true when `counterAccount` is set. Computed when
   * a row is materialised out of the DB so consumers can read `tx.isTransfer`
   * without re-deriving it; there is no column behind it.
   */
  isTransfer: boolean
  /** Always present once a row is read back from the DB; null on manual/CSV rows. */
  rawText: string | null
  /** Always present once a row is read back from the DB; null unless a schedule added it. */
  scheduleId: number | null
}

/** ParsedTransaction enriched with a DB identity and import timestamp, in minor units for the balance cascade */
export type StoredTransaction = ParsedTransaction & TransactionMeta

/** StoredTransaction as the API sends it: money as a plain number of major units, and the category's name */
export type Transaction = Omit<StoredTransaction, 'amount' | 'reportedBalance' | 'categoryId'> & {
  amount: number
  reportedBalance: number | null
  categoryId: number | null
  category: string | null
}

export type ImportError = { stage: 'parse'; decoded: DecodedMessage; cause: unknown }

export interface ImportSummary {
  months: number
  totalStored: number
  errors: ImportError[]
}

export interface StageMessages {
  transactions: StagedTransaction[]
  errors: ImportError[]
  earliest: string | null
  maxRowid: bigint | null
}

/** AccountBalance as computed, with every amount in minor units; converted at the DB write. */
export interface MinorBalance {
  account: AccountId
  yearMonth: string
  openingBalance: Minor
  debits: Minor
  credits: Minor
  transfersIn: Minor
  transfersOut: Minor
  closingBalance: Minor
  lastReportedBalance: Minor | null
  discrepancy: Minor | null
}

export type RecomputeBalance = Promise<{ balances: MinorBalance[]; months: number }>

/** A transfer rule as the import reads it. An empty `merchant` matches any merchant. */
export interface StoredTransferRule {
  account: AccountId
  type: TransactionType
  merchant: string
  counterAccount: AccountId
}

/** A validated POST /api/transfer-rules or PUT /api/transfer-rules/:id body. */
export type TransferRuleInput = StoredTransferRule

/** An account as the import reads it: the opening balance in minor units. */
export interface StoredAccount {
  id: AccountId
  label: string
  currency: Currency
  openingBalance: Minor
}

/** A validated POST /api/accounts body: the opening balance in minor units. */
export type AccountInput = StoredAccount

/**
 * What an import or a learn run reads from the settings tables, once at its
 * start: where SMS come from, which account a source key is, how transfer legs
 * are tagged, and what each account opens with.
 */
export interface IngestSettings {
  accounts: StoredAccount[]
  accountSources: Record<string, AccountId>
  transferRules: StoredTransferRule[]
  bankSenders: string[]
}

/** A non-transfer debit as read for the spending breakdown. */
export interface SpendingTransaction {
  id: string
  merchant: string | null
  amount: Minor
  account: string
  /** Name of the manual category; null means the merchant map decides. */
  category: string | null
  transactedAt: Date
}

/** A non-transfer transaction as read for the Insights page. */
export interface InsightTransaction {
  id: string
  yearMonth: string
  transactedAt: Date
  type: TransactionType
  amount: Minor
  currency: Currency
  account: string
  merchant: string | null
  /** Name of the manual category; null means the merchant map decides. */
  category: string | null
}

/**
 * Why a db write was refused; the route answers with REFUSAL_STATUS[refused]
 * and `error`. `invalid` is a reference to something not stored (a category id).
 */
export interface Refusal {
  refused: 'not found' | 'conflict' | 'invalid'
  error: string
}

/** A schedule as the import reads it: the amount in minor units, dates as "YYYY-MM-DD". */
export interface StoredSchedule {
  id: number
  type: TransactionType
  amount: Minor
  currency: Currency
  account: AccountId
  merchant: string
  categoryId: number | null
  frequency: Frequency
  interval: number
  startDate: string
  endDate: string | null
}

/** A manual transaction as the import reads it: the amount in minor units, the date "YYYY-MM-DD". */
export interface StoredManualTransaction {
  id: number
  type: TransactionType
  amount: Minor
  currency: Currency
  account: AccountId
  merchant: string
  categoryId: number | null
  date: string
}

/** A validated POST/PUT /api/manual-transactions body: the amount in minor units, the currency the account's. */
export type ManualTransactionInput = Omit<StoredManualTransaction, 'id'>

/** A validated POST/PUT /api/schedules body: the amount in minor units, the currency the account's. */
export type ScheduleInput = Omit<StoredSchedule, 'id'>
