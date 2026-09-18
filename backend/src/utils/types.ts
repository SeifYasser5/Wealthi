import type { AccountBalance, AccountId, Currency, TransactionType } from '@wealthi/shared'

// Contract types shared with the frontend, re-exported so backend modules keep
// importing everything from here.
export type { AccountBalance, AccountId, Currency, TransactionType }

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
  messageGuid?: string | null
  sourceRowid?: bigint | null
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
}

/** ParsedTransaction enriched with a DB identity and import timestamp */
export type Transaction = ParsedTransaction & TransactionMeta

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

/** A deterministic routing rule for an internal transfer; defined by the config schema. */
export type { TransferRule } from './config/schema'

/** A non-transfer debit as read for the spending breakdown. */
export interface SpendingTransaction {
  id: string
  merchant: string | null
  amount: number
  account: string
  /** Manual override; null means the merchant map decides. */
  category: string | null
  transactedAt: Date
}
