import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import {
  csvPath,
  loadCsvImport,
  loadCsvTransactions,
  parseCsvImport,
  splitCsvLine,
} from '../../src/utils/helpers/csv-import'
import type { CsvImport } from '../../src/utils/config'

const BOM = String.fromCharCode(0xfeff)

const def = (over: Partial<CsvImport> = {}): CsvImport => ({
  id: 'test',
  file: 'unused.csv',
  from: '2026-01',
  account: 'checking',
  columns: { date: 'Date', amount: 'Amount' },
  values: { currency: 'EGP' },
  ...over,
})

describe('splitCsvLine', () => {
  it('splits on the delimiter, honouring quotes and "" escapes', () => {
    expect(splitCsvLine('a,"b,c","say ""hi""",', ',')).toEqual(['a', 'b,c', 'say "hi"', ''])
    expect(splitCsvLine('a;b', ';')).toEqual(['a', 'b'])
  })
})

describe('csvPath', () => {
  it('fills {yearMonth}, {year} and {month}', () => {
    expect(csvPath('data/{yearMonth}/{year}-{month}.csv', '2026-03')).toBe('data/2026-03/2026-03.csv')
    expect(csvPath('flat.csv', '2026-03')).toBe('flat.csv')
  })
})

describe('parseCsvImport', () => {
  it('reads dated rows at local noon and keeps only the requested month', () => {
    const txs = parseCsvImport(def(), '2026-01', 'Date,Amount\n2026-01-05,-10\n2026-02-01,-99\n')
    expect(txs).toHaveLength(1)
    expect(txs[0]).toMatchObject({
      type: 'debit',
      amount: 1000,
      currency: 'EGP',
      account: 'checking',
      counterAccount: null,
      merchant: null,
      reportedBalance: null,
      yearMonth: '2026-01',
    })
    expect(txs[0].transactedAt.getHours()).toBe(12)
    expect(txs[0].transactedAt.getDate()).toBe(5)
  })

  it('reads a day-of-month column against the requested month', () => {
    const d = def({ columns: { day: 'Day', amount: 'Amount' } })
    const [tx] = parseCsvImport(d, '2026-02', 'Day,Amount\n28,5\n')
    expect(tx.transactedAt.getMonth()).toBe(1)
    expect(tx.transactedAt.getDate()).toBe(28)
  })

  it('decides direction by type column, then values.type, then the sign', () => {
    const withColumn = def({ columns: { date: 'Date', amount: 'Amount', type: 'Type' } })
    expect(parseCsvImport(withColumn, '2026-01', 'Date,Amount,Type\n2026-01-01,5,DEBIT\n')[0].type).toBe('debit')
    expect(
      parseCsvImport(def({ values: { currency: 'EGP', type: 'credit' } }), '2026-01', 'Date,Amount\n2026-01-01,-5\n')[0]
        .type,
    ).toBe('credit')
    expect(parseCsvImport(def(), '2026-01', 'Date,Amount\n2026-01-01,5\n')[0].type).toBe('credit')
    expect(parseCsvImport(def(), '2026-01', 'Date,Amount\n2026-01-01,-5\n')[0].type).toBe('debit')
  })

  it('falls back to values for empty cells', () => {
    const d = def({
      columns: { date: 'Date', amount: 'Amount', merchant: 'Who', currency: 'Cur' },
      values: { currency: 'USD', merchant: 'DEFAULT' },
    })
    const txs = parseCsvImport(d, '2026-01', 'Date,Amount,Who,Cur\n2026-01-01,1,,\n2026-01-02,1,SHOP,egp\n')
    expect(txs.map((t) => [t.merchant, t.currency])).toEqual([
      ['DEFAULT', 'USD'],
      ['SHOP', 'EGP'],
    ])
  })

  it('sets counterAccount from the import', () => {
    const [tx] = parseCsvImport(def({ counterAccount: 'card' }), '2026-01', 'Date,Amount\n2026-01-01,1\n')
    expect(tx.counterAccount).toBe('card')
  })

  it('accepts a BOM, CRLF, blank lines, a custom delimiter, thousands separators and a currency symbol', () => {
    const d = def({ delimiter: ';' })
    const txs = parseCsvImport(d, '2026-01', BOM + 'Date;Amount\r\n2026-01-01;"$1,234.50"\r\n\r\n2026-01-02;-£3\r\n')
    expect(txs.map((t) => [t.type, t.amount])).toEqual([
      ['credit', 123450],
      ['debit', 300],
    ])
  })

  it.each([
    ['a missing column', 'When,Amount\n2026-01-01,1', /column "Date" not found in header \(When, Amount\)/],
    ['a bad date', 'Date,Amount\n01/01/2026,1', /x\.csv:2: date must start with "YYYY-MM-DD", got "01\/01\/2026"/],
    ['an impossible date', 'Date,Amount\n2026-02-30,1', /x\.csv:2: 2026-02-30 is not a real date/],
    ['an empty date', 'Date,Amount\n,1', /x\.csv:2: missing or invalid date\/day ""/],
    ['a bad amount', 'Date,Amount\n2026-01-01,abc', /x\.csv:2: invalid amount "abc"/],
    ['an empty amount', 'Date,Amount\n2026-01-01,', /x\.csv:2: invalid amount ""/],
    ['an amount finer than minor units', 'Date,Amount\n2026-01-01,1.005', /x\.csv:2: invalid amount "1\.005"/],
  ])('throws on %s, naming file and line', (_, text, error) => {
    expect(() => parseCsvImport(def(), '2026-01', text, 'x.csv')).toThrow(error)
  })

  it('throws on a bad day, type or missing currency', () => {
    expect(() =>
      parseCsvImport(def({ columns: { day: 'Day', amount: 'Amount' } }), '2026-02', 'Day,Amount\n31,1', 'x.csv'),
    ).toThrow(/2026-02-31 is not a real date/)
    expect(() =>
      parseCsvImport(def({ columns: { day: 'Day', amount: 'Amount' } }), '2026-02', 'Day,Amount\nfirst,1', 'x.csv'),
    ).toThrow(/missing or invalid date\/day "first"/)
    const typed = def({ columns: { date: 'Date', amount: 'Amount', type: 'Type' } })
    expect(() => parseCsvImport(typed, '2026-01', 'Date,Amount,Type\n2026-01-01,1,refund', 'x.csv')).toThrow(
      /type must be debit\|credit, got "refund"/,
    )
    expect(() => parseCsvImport(def({ values: {} }), '2026-01', 'Date,Amount\n2026-01-01,1', 'x.csv')).toThrow(
      /no currency column value and no values.currency/,
    )
  })

  it('defaults the source in errors to the file template', () => {
    expect(() => parseCsvImport(def({ file: 'tpl.csv' }), '2026-01', 'Date,Amount\n2026-01-01,x')).toThrow(
      /^tpl\.csv:2/,
    )
  })

  it('handles an empty file', () => {
    expect(() => parseCsvImport(def(), '2026-01', '')).toThrow(/column "Date" not found/)
  })
})

describe('loading files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wealthi-csv-'))
  writeFileSync(join(dir, '2026-01.csv'), 'Date,Amount\n2026-01-03,-7\n')
  writeFileSync(join(dir, 'all.csv'), 'Date,Amount\n2026-01-03,-1\n2026-02-03,-2\n')
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  afterEach(() => vi.useRealTimers())

  it('reads the month file, or nothing when it does not exist', () => {
    const d = def({ file: join(dir, '{yearMonth}.csv') })
    expect(loadCsvImport(d, '2026-01').map((t) => t.amount)).toEqual([700])
    expect(loadCsvImport(d, '2026-02')).toEqual([])
  })

  it('only loads imports whose from/to range covers the month', () => {
    const imports = [
      def({ id: 'a', file: join(dir, 'all.csv'), from: '2026-02', to: '2026-02' }),
      def({ id: 'b', file: join(dir, 'all.csv'), from: '2026-01', to: '2026-01' }),
    ]
    expect(loadCsvTransactions('2026-01', imports).map((t) => t.amount)).toEqual([100])
    expect(loadCsvTransactions('2026-02', imports).map((t) => t.amount)).toEqual([200])
    expect(loadCsvTransactions('2026-03', imports)).toEqual([])
  })

  it('runs an open-ended import through the current month', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 0, 15) })
    const imports = [def({ file: join(dir, 'all.csv'), from: '2025-12' })]
    expect(loadCsvTransactions('2026-01', imports)).toHaveLength(1)
    expect(loadCsvTransactions('2026-02', imports)).toEqual([])
  })

  it('defaults to the configured imports (none in the test config)', () => {
    expect(loadCsvTransactions('2026-01')).toEqual([])
  })
})

describe('parseCsvImport strictness', () => {
  it('trims header names and cells', () => {
    const d = def({ columns: { date: 'Date', amount: 'Amount', merchant: 'Who' } })
    const [tx] = parseCsvImport(d, '2026-01', ' Date , Amount , Who \n 2026-01-02 , -5 ,  SHOP  \n')
    expect(tx).toMatchObject({ amount: 500, merchant: 'SHOP', type: 'debit' })
  })

  it('skips whitespace-only lines', () => {
    expect(parseCsvImport(def(), '2026-01', 'Date,Amount\n   \n2026-01-02,1\n')).toHaveLength(1)
  })

  it('treats a whitespace-only cell as empty and falls back to values', () => {
    const d = def({
      columns: { date: 'Date', amount: 'Amount', merchant: 'Who' },
      values: { currency: 'EGP', merchant: 'DEFAULT' },
    })
    expect(parseCsvImport(d, '2026-01', 'Date,Amount,Who\n2026-01-02,1,   \n')[0].merchant).toBe('DEFAULT')
  })

  it('requires the date at the start of the cell and the day to be the whole cell', () => {
    expect(() => parseCsvImport(def(), '2026-01', 'Date,Amount\non 2026-01-02,1', 'x.csv')).toThrow(/date must start/)
    const byDay = def({ columns: { day: 'Day', amount: 'Amount' } })
    expect(() => parseCsvImport(byDay, '2026-01', 'Day,Amount\nx5,1', 'x.csv')).toThrow(/invalid date\/day "x5"/)
    expect(() => parseCsvImport(byDay, '2026-01', 'Day,Amount\n5th,1', 'x.csv')).toThrow(/invalid date\/day "5th"/)
    expect(() => parseCsvImport(byDay, '2026-01', 'Day,Amount\n123,1', 'x.csv')).toThrow(/invalid date\/day "123"/)
  })

  it('strips only a leading currency symbol, however long', () => {
    expect(parseCsvImport(def(), '2026-01', 'Date,Amount\n2026-01-02,EGP 12\n')[0].amount).toBe(1200)
    expect(parseCsvImport(def(), '2026-01', 'Date,Amount\n2026-01-02,-US$3\n')[0]).toMatchObject({
      type: 'debit',
      amount: 300,
    })
    expect(() => parseCsvImport(def(), '2026-01', 'Date,Amount\n2026-01-02,12 EGP', 'x.csv')).toThrow(/invalid amount/)
  })

  it('resolves a relative file path against backend/', () => {
    const d = def({ file: 'test/fixtures/csv/{yearMonth}/conversions.csv', columns: { day: 'Day', amount: 'Amount' } })
    expect(loadCsvImport(d, '2026-03').map((t) => t.amount)).toEqual([100000, 50000])
  })
})
