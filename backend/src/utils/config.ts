import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AccountId, Currency } from './types'
import type { TransferRule } from '../services/transfer'

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

/** One of your own accounts. The id is what transactions and balances store. */
export interface Account {
  id: AccountId
  label: string
  currency: Currency
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

export const CONFIG_PATH = resolve(__dirname, '../../config/wealthi.json')

const TX_TYPES = ['debit', 'credit']
const CURRENCIES = ['EGP', 'USD']

function fail(message: string): never {
  throw new Error(`Invalid ${CONFIG_PATH}: ${message}`)
}

function checkAccount(ids: Set<string>, value: unknown, where: string): void {
  if (!ids.has(value as string)) fail(`${where}: unknown account "${value}"`)
}

function checkEntry(ids: Set<string>, e: Partial<ManualEntry>, where: string): void {
  if (!TX_TYPES.includes(e.type as string)) fail(`${where}: type must be debit|credit`)
  if (typeof e.amount !== 'number' || e.amount < 0) fail(`${where}: amount must be a positive number`)
  if (!CURRENCIES.includes(e.currency as string)) fail(`${where}: currency must be EGP|USD`)
  checkAccount(ids, e.account, where)
  if (typeof e.merchant !== 'string') fail(`${where}: merchant must be a string`)
}

function validate(raw: WealthiConfig): WealthiConfig {
  if (!Array.isArray(raw.bankSenders) || raw.bankSenders.length === 0) fail('bankSenders must be a non-empty array')
  raw.bankSenders.forEach((sender, i) => {
    if (typeof sender !== 'string' || sender === '') fail(`bankSenders[${i}] must be a non-empty string`)
  })

  if (!Array.isArray(raw.accounts) || raw.accounts.length === 0) fail('accounts must be a non-empty array')
  const ids = new Set<string>()
  raw.accounts.forEach((a, i) => {
    const where = `accounts[${i}]`
    if (typeof a.id !== 'string' || a.id === '') fail(`${where}: id must be a non-empty string`)
    if (ids.has(a.id)) fail(`${where}: duplicate id "${a.id}"`)
    if (typeof a.label !== 'string') fail(`${where}: label must be a string`)
    if (!CURRENCIES.includes(a.currency)) fail(`${where}: currency must be EGP|USD`)
    ids.add(a.id)
  })

  if (typeof raw.accountSources !== 'object' || raw.accountSources === null) fail('accountSources must be an object')
  for (const [source, account] of Object.entries(raw.accountSources)) {
    checkAccount(ids, account, `accountSources["${source}"]`)
  }

  if (typeof raw.openingBalances !== 'object' || raw.openingBalances === null) fail('openingBalances must be an object')
  for (const id of ids) {
    if (typeof raw.openingBalances[id] !== 'number') fail(`openingBalances.${id} must be a number`)
  }
  for (const key of Object.keys(raw.openingBalances)) checkAccount(ids, key, 'openingBalances')
  if (typeof raw.merchantCategories !== 'object' || raw.merchantCategories === null) {
    fail('merchantCategories must be an object')
  }
  if (!Array.isArray(raw.extraCategories)) fail('extraCategories must be an array')
  if (!Array.isArray(raw.transferRules)) fail('transferRules must be an array')
  if (!Array.isArray(raw.recurringTransactions)) fail('recurringTransactions must be an array')
  if (!Array.isArray(raw.manualTransactions)) fail('manualTransactions must be an array')

  raw.transferRules.forEach((r, i) => {
    const where = `transferRules[${i}]`
    if (typeof r.id !== 'string') fail(`${where}: id must be a string`)
    checkAccount(ids, r.account, where)
    checkAccount(ids, r.counterAccount, where)
    if (!TX_TYPES.includes(r.type)) fail(`${where}: type must be debit|credit`)
  })
  raw.recurringTransactions.forEach((e, i) => {
    const where = `recurringTransactions[${i}]`
    checkEntry(ids, e, where)
    if (!/^\d{4}-\d{2}$/.test(e.startYearMonth)) fail(`${where}: startYearMonth must be "YYYY-MM"`)
  })
  raw.manualTransactions.forEach((e, i) => {
    const where = `manualTransactions[${i}]`
    checkEntry(ids, e, where)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) fail(`${where}: date must be "YYYY-MM-DD"`)
  })

  raw.csvImports ??= []
  if (!Array.isArray(raw.csvImports)) fail('csvImports must be an array')
  raw.csvImports.forEach((c, i) => {
    const where = `csvImports[${i}]`
    if (typeof c.id !== 'string') fail(`${where}: id must be a string`)
    if (typeof c.file !== 'string' || c.file === '') fail(`${where}: file must be a non-empty string`)
    if (!/^\d{4}-\d{2}$/.test(c.from)) fail(`${where}: from must be "YYYY-MM"`)
    if (c.to !== undefined && (!/^\d{4}-\d{2}$/.test(c.to) || c.to < c.from)) {
      fail(`${where}: to must be "YYYY-MM" and not before from`)
    }
    if (c.delimiter !== undefined && (typeof c.delimiter !== 'string' || c.delimiter.length !== 1)) {
      fail(`${where}: delimiter must be a single character`)
    }
    checkAccount(ids, c.account, where)
    if (c.counterAccount !== undefined) checkAccount(ids, c.counterAccount, where)

    const columns = c.columns ?? {}
    if (typeof columns.amount !== 'string') fail(`${where}: columns.amount is required`)
    if ((columns.date === undefined) === (columns.day === undefined))
      fail(`${where}: set exactly one of columns.date or columns.day`)
    const values = c.values ?? {}
    if (values.type !== undefined && !TX_TYPES.includes(values.type)) fail(`${where}: values.type must be debit|credit`)
    if (values.currency !== undefined && !CURRENCIES.includes(values.currency))
      fail(`${where}: values.currency must be EGP|USD`)
    if (columns.currency === undefined && values.currency === undefined) {
      fail(`${where}: set columns.currency or values.currency`)
    }
  })
  return raw
}

function load(): WealthiConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found at ${CONFIG_PATH}. Copy config/wealthi.example.json to config/wealthi.json.`)
  }
  return validate(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
}

export const config: WealthiConfig = load()
