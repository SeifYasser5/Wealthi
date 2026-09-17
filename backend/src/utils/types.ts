/**
 * One of your own accounts. The set is configured, not hardcoded: see
 * `accounts` in config/wealthi.json and ALL_ACCOUNTS in utils/accounts.ts.
 */
export type AccountId = string

export type Currency = 'EGP' | 'USD'

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
  amount: number
  currency: Currency
  account: AccountId
  /** Merchant or payee name as printed by the bank */
  merchant: string | null
  /**
   * Manually assigned spending category. Absent/null on freshly parsed rows —
   * the spending breakdown then falls back to the merchant map. Set through
   * PATCH /api/transactions/:id/category.
   */
  category?: string | null
  /**
   * Own account on the other side when this leg is an internal transfer; null
   * for ordinary spend/income. A non-null value is what marks a transaction as
   * a transfer — direction is still read from `type` (debit = out, credit = in).
   */
  counterAccount: AccountId | null
  /** Bank-reported available balance following this transaction */
  reportedBalance: number | null
  /** Timestamp from the SMS text (null when the SMS omits it) */
  transactedAt: Date
  /** Decoded SMS text, preserved verbatim */
  raw: string
  messageGuid?: string | null
  sourceRowid?: bigint | null
}

export interface DebitTransaction extends BaseTransaction {
  type: 'debit'
}

export interface CreditTransaction extends BaseTransaction {
  type: 'credit'
}

/**
 * Discriminated union on `type`. Transfers are not a separate variant: an
 * internal transfer is a debit (money out) or credit (money in) that also
 * carries a non-null `counterAccount`. Test for one with `counterAccount !== null`.
 */
export type ParsedTransaction = DebitTransaction | CreditTransaction

/** The direction discriminant on its own: debit = money out, credit = money in. */
export type TransactionType = ParsedTransaction['type']

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
}

/** ParsedTransaction enriched with a DB identity and import timestamp */
export type Transaction = ParsedTransaction & TransactionMeta

/** Computed balance summary for one account in one calendar month */
export interface AccountBalance {
  account: AccountId
  yearMonth: string
  openingBalance: number
  debits: number
  credits: number
  transfersIn: number
  transfersOut?: number
  closingBalance: number
  /** Last bank-reported balance seen in SMS for this period */
  lastReportedBalance: number | null
  /** closingBalance − lastReportedBalance; null when lastReportedBalance is null */
  discrepancy?: number | null
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

export type RecomputeBalance = Promise<{ balances: AccountBalance[]; months: number }>
