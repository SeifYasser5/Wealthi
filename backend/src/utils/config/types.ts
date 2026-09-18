import type { Account } from '@wealthi/shared'
import type { AccountId, Currency } from '../types'
import type { TransferRule } from '../../services/transfer'

/**
 * Personal data that must never be committed: your accounts and how bank SMS
 * map onto them, opening balances, the merchant category map, transfer rules
 * (which carry real names) and manual entries.
 *
 * Lives in backend/config/wealthi.json (gitignored). A committed
 * wealthi.example.json documents the shape — copy it to get started.
 */

/** A transaction that never appears in bank SMS (fee, reversal, adjustment). */
export interface ManualEntry {
  type: 'debit' | 'credit'
  /** Always positive; direction is encoded in type */
  amount: number
  currency: Currency
  account: AccountId
  /** Short description of what this is */
  merchant: string
  /** "YYYY-MM-DD" */
  date: string
}

/** A manual entry repeated monthly from startYearMonth through the current month. */
export interface RecurringEntry extends Omit<ManualEntry, 'date'> {
  /** "YYYY-MM", inclusive */
  startYearMonth: string
  dayOfMonth: number
}

/**
 * A CSV file (or one file per month) of transactions that never arrive by SMS.
 * See helpers/csv-loader.ts for how rows become transactions.
 */
export interface CsvImport {
  /** Human-readable id, used in error messages */
  id: string
  /**
   * Path relative to backend/. May contain {yearMonth}, {year} and {month},
   * e.g. "data/{yearMonth}/usd.csv".
   */
  file: string
  /** "YYYY-MM", inclusive — first month the file exists for */
  from: string
  /** "YYYY-MM", inclusive. Omit to keep importing through the current month. */
  to?: string
  /** Cell separator, default "," */
  delimiter?: string
  /** Own account every row lands on */
  account: AccountId
  /** Set when every row is an internal transfer from/to this own account */
  counterAccount?: AccountId
  /**
   * CSV header name per field. `amount` is required, plus either `date`
   * ("YYYY-MM-DD…") or `day` (day of the month the file belongs to).
   */
  columns: { amount: string; date?: string; day?: string; type?: string; currency?: string; merchant?: string }
  /** Fixed values for fields with no column, or for empty cells in one */
  values?: { type?: 'debit' | 'credit'; currency?: Currency; merchant?: string }
}

export interface WealthiConfig {
  /**
   * chat.db `handle.id` of each bank's SMS sender — the display name or phone
   * number your bank sends from. Only messages from these handles are imported.
   */
  bankSenders: string[]
  accounts: Account[]
  /**
   * Parser source → own account. Parsers emit a bank-level source such as
   * "adcb:card" or "adcb:account:<last 4 digits>"; see each parser for its keys.
   */
  accountSources: Record<string, AccountId>
  /** Genesis balances, used for the first month with no earlier snapshot */
  openingBalances: Record<AccountId, number>
  /** Merchant name as printed by the bank → category label */
  merchantCategories: Record<string, string>
  /** Categories offered by the UI that no merchant maps to yet */
  extraCategories: string[]
  transferRules: TransferRule[]
  recurringTransactions: RecurringEntry[]
  manualTransactions: ManualEntry[]
  /** Optional; defaults to none */
  csvImports: CsvImport[]
}
