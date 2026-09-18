import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config, type CsvImport } from '../../utils/config'
import { toYearMonth } from '../../utils/helpers'
import type { Currency, StagedTransaction, TransactionType } from '../../utils/types'

/**
 * Transactions that live in CSV files instead of bank SMS — e.g. a statement
 * export, or a log of conversions the bank never texts about.
 *
 * Every source is declared in `csvImports` in config/wealthi.json: a file path
 * template, the months it covers, which CSV header feeds which field, and
 * fixed values for fields the file doesn't carry. Nothing here knows about a
 * specific bank or account.
 *
 * The path is resolved against backend/ and may contain {yearMonth}, {year}
 * and {month}, so one entry covers a file per month. A path without
 * placeholders is a single file; its rows are filtered to the requested month.
 * A month whose file doesn't exist yields no rows.
 */

const BACKEND_ROOT = resolve(__dirname, '../../..')

/** All CSV-sourced transactions for one "YYYY-MM", across every configured import. */
export function loadCsvTransactions(yearMonth: string, imports: CsvImport[] = config.csvImports): StagedTransaction[] {
  return imports.filter((def) => coversMonth(def, yearMonth)).flatMap((def) => loadCsvImport(def, yearMonth))
}

/** Rows of one import for one month, or [] when that month's file doesn't exist. */
export function loadCsvImport(def: CsvImport, yearMonth: string): StagedTransaction[] {
  const filePath = resolve(BACKEND_ROOT, csvPath(def.file, yearMonth))
  if (!existsSync(filePath)) return []
  return parseCsvImport(def, yearMonth, readFileSync(filePath, 'utf8'), filePath)
}

// `from` through `to` inclusive; an open-ended import runs through the current month.
function coversMonth(def: CsvImport, yearMonth: string): boolean {
  return yearMonth >= def.from && yearMonth <= (def.to ?? toYearMonth(new Date()))
}

export function csvPath(template: string, yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  return template
    .replace(/\{yearMonth\}/g, yearMonth)
    .replace(/\{year\}/g, year)
    .replace(/\{month\}/g, month)
}

/**
 * Turns CSV text into transactions for `yearMonth`. Each field comes from its
 * mapped column when the row has a value there, otherwise from `values`.
 * Without a type from either, the amount's sign decides: negative = debit.
 * Throws on a malformed row, naming the file and line.
 */
export function parseCsvImport(
  def: CsvImport,
  yearMonth: string,
  text: string,
  source = def.file,
): StagedTransaction[] {
  const delimiter = def.delimiter ?? ','
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const header = splitCsvLine(lines[0] ?? '', delimiter).map((h) => h.trim())
  const { columns, values = {} } = def

  const index = (name: string | undefined): number | undefined => {
    if (name === undefined) return undefined
    const i = header.indexOf(name)
    if (i === -1) throw new Error(`${source}: column "${name}" not found in header (${header.join(', ')})`)
    return i
  }
  const col = {
    date: index(columns.date),
    day: index(columns.day),
    amount: index(columns.amount)!,
    type: index(columns.type),
    currency: index(columns.currency),
    merchant: index(columns.merchant),
  }

  const transactions: StagedTransaction[] = []

  lines.slice(1).forEach((line, i) => {
    if (!line.trim()) return
    const where = `${source}:${i + 2}`
    const cells = splitCsvLine(line, delimiter).map((c) => c.trim())
    const cell = (at: number | undefined): string | undefined => (at === undefined ? undefined : cells[at] || undefined)

    const transactedAt = rowDate(cell(col.date), cell(col.day), yearMonth, where)
    if (toYearMonth(transactedAt) !== yearMonth) return

    const signed = parseAmount(cell(col.amount), where)
    const type = (cell(col.type)?.toLowerCase() ?? values.type ?? (signed < 0 ? 'debit' : 'credit')) as TransactionType
    if (type !== 'debit' && type !== 'credit') throw new Error(`${where}: type must be debit|credit, got "${type}"`)

    const currency = (cell(col.currency)?.toUpperCase() ?? values.currency) as Currency | undefined
    if (currency === undefined) throw new Error(`${where}: no currency column value and no values.currency`)

    transactions.push({
      type,
      amount: Math.abs(signed),
      currency,
      account: def.account,
      counterAccount: def.counterAccount ?? null,
      merchant: cell(col.merchant) ?? values.merchant ?? null,
      transactedAt,
      reportedBalance: null,
      yearMonth,
    })
  })

  return transactions
}

// Noon local time keeps a date-only row inside its calendar day in any timezone.
function rowDate(date: string | undefined, day: string | undefined, yearMonth: string, where: string): Date {
  let y: number, m: number, d: number
  if (date !== undefined) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
    if (!match) throw new Error(`${where}: date must start with "YYYY-MM-DD", got "${date}"`)
    ;[y, m, d] = match.slice(1).map(Number)
  } else if (day !== undefined && /^\d{1,2}$/.test(day)) {
    ;[y, m] = yearMonth.split('-').map(Number)
    d = Number(day)
  } else {
    throw new Error(`${where}: missing or invalid date/day "${date ?? day ?? ''}"`)
  }
  const result = new Date(y, m - 1, d, 12)
  if (result.getDate() !== d) throw new Error(`${where}: ${date ?? `${yearMonth}-${day}`} is not a real date`)
  return result
}

// Accepts thousands separators and a leading currency symbol: "$1,234.50", "-42".
function parseAmount(value: string | undefined, where: string): number {
  const cleaned = (value ?? '').replace(/[,\s]/g, '').replace(/^(-?)[^\d.-]+/, '$1')
  const amount = Number(cleaned)
  if (cleaned === '' || !Number.isFinite(amount)) throw new Error(`${where}: invalid amount "${value ?? ''}"`)
  return amount
}

/** Splits one CSV line, honouring double-quoted cells and "" escapes. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      cells.push(current)
      current = ''
    } else current += ch
  }
  cells.push(current)
  return cells
}
