import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_GUID_PREFIX, DEMO_MONTHS, DEMO_SENDER, demoLedger, formatMinor } from '../../src/demo/ledger'
import { DEMO_PATTERNS_DIR, seedDemo } from '../../src/demo/seed'
import type { PatternFile } from '../../src/services/patterns/pattern'
import { learnBank } from '../../src/services/patterns/learn'
import { toYearMonth } from '../../src/utils/helpers'

// The demo ledger's shape. That every message parses and every month
// reconciles under the demo config is checked end to end in integration/demo.test.ts.

const NOW = new Date('2026-10-14T15:00:00Z')
const ledger = demoLedger(NOW)
const months = (messages: { date: Date }[]) => [...new Set(messages.map((m) => toYearMonth(m.date)))]

describe('demoLedger', () => {
  it('covers the current month and the ones before it, up to now', () => {
    expect(months(ledger)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(months(ledger)).toHaveLength(DEMO_MONTHS)
    expect(ledger.every((m) => m.date <= NOW && m.sender === DEMO_SENDER)).toBe(true)
  })

  it('is oldest first, one message per instant, each with its own demo guid', () => {
    const times = ledger.map((m) => m.date.getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(new Set(times).size).toBe(ledger.length)
    expect(new Set(ledger.map((m) => m.guid)).size).toBe(ledger.length)
    expect(ledger.every((m) => m.guid.startsWith(DEMO_GUID_PREFIX))).toBe(true)
  })

  it('gives a month the same messages on every start; the current month only grows', () => {
    expect(demoLedger(NOW)).toEqual(ledger)
    const later = demoLedger(new Date('2026-10-28T15:00:00Z'))
    expect(later.slice(0, ledger.length)).toEqual(ledger)
    expect(later.length).toBeGreaterThan(ledger.length)
  })

  it('always pays something off the card, whatever month it is', () => {
    for (let month = 0; month < 24; month++) {
      const payments = demoLedger(new Date(2026, month, 28, 12)).filter((m) => m.text.includes('CARD PAYMENT'))
      expect(payments.length).toBeGreaterThan(0)
      for (const { text } of payments) expect(text).not.toMatch(/EGP (0\.00|-)/)
    }
  })

  it('is what learn mines: the committed pattern file is its output, reviewed', () => {
    const file = JSON.parse(readFileSync(resolve(DEMO_PATTERNS_DIR, 'demo-bank.json'), 'utf8')) as PatternFile
    const decoded = ledger.map((m, i) => ({ ...m, rowid: BigInt(i + 1), messageDate: m.date }))
    const learned = learnBank(file.bank, decoded)
    expect(learned.map((p) => [p.id, p.type, p.pattern])).toEqual(file.patterns.map((p) => [p.id, p.type, p.generated]))
    expect(file.patterns.every((p) => p.enabled)).toBe(true)
  })
})

describe('formatMinor', () => {
  it('prints minor units the way the bank does', () => {
    expect(formatMinor(5)).toBe('0.05')
    expect(formatMinor(123450)).toBe('1,234.50')
    expect(formatMinor(3_850_000)).toBe('38,500.00')
    expect(formatMinor(-100_000)).toBe('-1,000.00')
  })
})

describe('seedDemo', () => {
  it('refuses to run on any config but the demo one', async () => {
    // The unit project loads fixtures/wealthi.test.json.
    await expect(seedDemo(NOW)).rejects.toThrow('demo mode needs WEALTHI_CONFIG_PATH=')
  })
})
