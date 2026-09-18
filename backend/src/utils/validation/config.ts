import type { CsvImport, ManualEntry, WealthiConfig } from '../config/types'

const TX_TYPES = ['debit', 'credit']
const CURRENCIES = ['EGP', 'USD']

/** Thrown for a malformed config; load() prefixes it with the file path. */
export class ConfigError extends Error {}

function fail(message: string): never {
  throw new ConfigError(message)
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

function checkCsvImport(ids: Set<string>, c: CsvImport, where: string): void {
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
}

/** Checks the parsed config in place, filling optional keys; throws ConfigError. */
export function validate(raw: WealthiConfig): WealthiConfig {
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
  raw.csvImports.forEach((c, i) => checkCsvImport(ids, c, `csvImports[${i}]`))
  return raw
}
