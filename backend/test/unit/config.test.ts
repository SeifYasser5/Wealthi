import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { WealthiConfigSchema } from '../../src/utils/config/schema'

type ConfigInput = z.input<typeof WealthiConfigSchema>
type CsvInput = NonNullable<ConfigInput['csvImports']>[number]

const valid = (): ConfigInput & { csvImports: CsvInput[] } => ({
  bankSenders: ['Bank'],
  accounts: [
    { id: 'a', label: 'A', currency: 'EGP' },
    { id: 'b', label: 'B', currency: 'USD' },
  ],
  accountSources: { 'bank:1': 'a' },
  openingBalances: { a: 0, b: 0 },
  merchantCategories: {},
  extraCategories: [],
  transferRules: [{ id: 'r', account: 'a', type: 'debit', counterAccount: 'b' }],
  recurringTransactions: [
    {
      type: 'debit',
      amount: 1,
      currency: 'EGP',
      account: 'a',
      merchant: 'm',
      startYearMonth: '2026-01',
      dayOfMonth: 1,
    },
  ],
  manualTransactions: [{ type: 'debit', amount: 1, currency: 'EGP', account: 'a', merchant: 'm', date: '2026-01-01' }],
  csvImports: [
    {
      id: 'c',
      file: 'f.csv',
      from: '2026-01',
      to: '2026-02',
      account: 'a',
      counterAccount: 'b',
      columns: { amount: 'A', date: 'D' },
      values: { currency: 'EGP' },
    },
  ],
})

/** The issue messages of a failed parse, as "path: message". */
function issues(input: unknown): string[] {
  const r = WealthiConfigSchema.safeParse(input)
  if (r.success) return []
  return r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('WealthiConfigSchema', () => {
  it('accepts a valid config and defaults csvImports', () => {
    expect(issues(valid())).toEqual([])
    const withoutCsv: ConfigInput = valid()
    delete withoutCsv.csvImports
    expect(WealthiConfigSchema.parse(withoutCsv).csvImports).toEqual([])
  })

  it('requires at least one sender and one account', () => {
    expect(issues({ ...valid(), bankSenders: [] })).toContainEqual(expect.stringMatching(/^bankSenders:/))
    expect(issues({ ...valid(), accounts: [], openingBalances: {} }).join()).toMatch(/accounts:/)
  })

  it('rejects duplicate account ids', () => {
    const c = valid()
    c.accounts.push({ id: 'a', label: 'again', currency: 'EGP' })
    expect(issues(c)).toContain('accounts.2.id: duplicate id "a"')
  })

  it('rejects references to unknown accounts everywhere they appear', () => {
    const c = valid()
    c.accountSources['bank:2'] = 'x'
    c.openingBalances = { ...c.openingBalances, y: 0 }
    c.transferRules[0] = { ...c.transferRules[0], account: 'x1', counterAccount: 'x2' }
    c.recurringTransactions[0].account = 'x3'
    c.manualTransactions[0].account = 'x4'
    c.csvImports[0] = { ...c.csvImports[0], account: 'x5', counterAccount: 'x6' }
    expect(issues(c)).toEqual(
      expect.arrayContaining([
        'accountSources.bank:2: unknown account "x"',
        'openingBalances.y: unknown account "y"',
        'transferRules.0.account: unknown account "x1"',
        'transferRules.0.counterAccount: unknown account "x2"',
        'recurringTransactions.0.account: unknown account "x3"',
        'manualTransactions.0.account: unknown account "x4"',
        'csvImports.0.account: unknown account "x5"',
        'csvImports.0.counterAccount: unknown account "x6"',
      ]),
    )
  })

  it('requires an opening balance for every account', () => {
    expect(issues({ ...valid(), openingBalances: { a: 0 } })).toContain('openingBalances.b: missing opening balance')
  })

  it('validates entry shapes', () => {
    const c = valid()
    c.manualTransactions[0].date = '2026-1-1'
    c.manualTransactions[0].amount = -1
    c.recurringTransactions[0].dayOfMonth = 32
    c.recurringTransactions[0].startYearMonth = '2026-1'
    ;(c.accounts[0] as { currency: string }).currency = 'GBP'
    const all = issues(c).join('\n')
    expect(all).toMatch(/manualTransactions\.0\.date: must be "YYYY-MM-DD"/)
    expect(all).toMatch(/manualTransactions\.0\.amount/)
    expect(all).toMatch(/recurringTransactions\.0\.dayOfMonth/)
    expect(all).toMatch(/recurringTransactions\.0\.startYearMonth: must be "YYYY-MM"/)
    expect(all).toMatch(/accounts\.0\.currency/)
  })

  it('checks csvImports: range order, exactly one of date/day, and a currency source', () => {
    const c = valid()
    c.csvImports[0] = { ...c.csvImports[0], from: '2026-03', to: '2026-01' }
    expect(issues(c)).toContain('csvImports.0.to: must not be before from')

    const both = valid()
    both.csvImports[0].columns = { amount: 'A', date: 'D', day: 'Y' } as CsvInput['columns']
    expect(issues(both)).toContain('csvImports.0.columns: set exactly one of columns.date or columns.day')

    const neither = valid()
    neither.csvImports[0].columns = { amount: 'A' } as CsvInput['columns']
    expect(issues(neither)).toContain('csvImports.0.columns: set exactly one of columns.date or columns.day')

    const noCurrency = valid()
    noCurrency.csvImports[0].values = {}
    expect(issues(noCurrency)).toContain('csvImports.0: set columns.currency or values.currency')
    noCurrency.csvImports[0].columns = {
      amount: 'A',
      date: 'D',
      currency: 'C',
    } as CsvInput['columns']
    expect(issues(noCurrency)).toEqual([])
  })
})

describe('config loading', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wealthi-config-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const load = () => import('../../src/utils/config')

  it('loads the file WEALTHI_CONFIG_PATH names and derives the account lookups', async () => {
    const config = await load()
    expect(config.CONFIG_PATH).toBe(resolve(__dirname, '../fixtures/wealthi.test.json'))
    expect(config.ALL_ACCOUNTS).toEqual(['checking', 'card', 'savings_usd'])
    expect(config.isAccountId('card')).toBe(true)
    expect(config.isAccountId('nope')).toBe(false)
    expect(config.accountFor('test-bank:1111')).toBe('checking')
    expect(config.accountFor('test-bank:0000')).toBeUndefined()
  })

  it('falls back to config/wealthi.json without the override', async () => {
    vi.stubEnv('WEALTHI_CONFIG_PATH', undefined)
    vi.doMock('node:fs', async (orig) => {
      const fs = await orig<typeof import('node:fs')>()
      return { ...fs, existsSync: () => false }
    })
    await expect(load()).rejects.toThrow(/config[\\/]wealthi\.json\. Copy config\/wealthi\.example\.json/)
    vi.doUnmock('node:fs')
  })

  it('stops with a clear error when the file is missing', async () => {
    vi.stubEnv('WEALTHI_CONFIG_PATH', join(dir, 'missing.json'))
    await expect(load()).rejects.toThrow(/Config not found at .*missing\.json/)
  })

  it('stops with every issue and its path when the file is invalid', async () => {
    const file = join(dir, 'bad.json')
    writeFileSync(file, JSON.stringify({ ...valid(), bankSenders: [], openingBalances: { a: 0 } }))
    vi.stubEnv('WEALTHI_CONFIG_PATH', file)
    const error = await load().then(
      () => null,
      (e: Error) => e.message,
    )
    expect(error).toMatch(/^Invalid .*bad\.json:/)
    expect(error).toMatch(/bankSenders/)
    expect(error).toMatch(/missing opening balance/)
  })

  it('accepts the committed example config', async () => {
    vi.stubEnv('WEALTHI_CONFIG_PATH', resolve(__dirname, '../../config/wealthi.example.json'))
    await expect(load()).resolves.toBeTruthy()
  })
})

describe('WealthiConfigSchema formats', () => {
  it.each(['2026-01x', 'x2026-01', '2026-01-01'])('rejects year-month %j', (bad) => {
    const c = valid()
    c.recurringTransactions[0].startYearMonth = bad
    expect(issues(c).join()).toMatch(/startYearMonth: must be "YYYY-MM"/)
  })

  it.each(['2026-01-01x', 'x2026-01-01', '2026-01-01T00:00'])('rejects date %j', (bad) => {
    const c = valid()
    c.manualTransactions[0].date = bad
    expect(issues(c).join()).toMatch(/date: must be "YYYY-MM-DD"/)
  })

  it('accepts dayOfMonth 1 through 31', () => {
    const c = valid()
    c.recurringTransactions[0].dayOfMonth = 31
    expect(issues(c)).toEqual([])
    c.recurringTransactions[0].dayOfMonth = 0
    expect(issues(c).join()).toMatch(/dayOfMonth/)
  })

  it('accepts a csv import that ends in its start month, or has no end', () => {
    const c = valid()
    c.csvImports[0] = { ...c.csvImports[0], from: '2026-02', to: '2026-02' }
    expect(issues(c)).toEqual([])
    c.csvImports[0] = { ...c.csvImports[0], to: undefined }
    expect(issues(c)).toEqual([])
  })

  it('accepts a csv import with a currency column and no values at all', () => {
    const c = valid()
    c.csvImports[0] = { ...c.csvImports[0], columns: { amount: 'A', date: 'D', currency: 'C' }, values: undefined }
    expect(issues(c)).toEqual([])
  })

  it('reports custom issues with the custom code', () => {
    const c = valid()
    c.accounts.push({ id: 'a', label: 'again', currency: 'EGP' })
    c.csvImports[0] = { ...c.csvImports[0], from: '2026-03', to: '2026-01', values: {} }
    const r = WealthiConfigSchema.safeParse(c)
    expect(r.success).toBe(false)
    if (!r.success) expect(new Set(r.error.issues.map((i) => i.code))).toEqual(new Set(['custom']))
  })
})
