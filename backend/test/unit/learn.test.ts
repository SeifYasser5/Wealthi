import { describe, expect, it } from 'vitest'
import { learnBank } from '../../src/services/patterns/learn'
import { extract, type Pattern } from '../../src/services/patterns/pattern'
import { mergePatterns } from '../../src/services/patterns/store'
import type { DecodedMessage } from '../../src/utils/types'

const MERCHANTS = ['ACME GROCERS', 'CITY CAFE', 'FUEL STATION 12', 'BOOK NOOK', 'CORNER PHARMACY', 'METRO TICKETS']

const sms = (text: string, i: number): DecodedMessage => ({
  rowid: BigInt(i + 1),
  guid: `g-${i}`,
  messageDate: new Date(Date.UTC(2026, 0, 1 + i, 12)),
  text,
  sender: 'Test Bank',
})

// One card-charge template with varying merchants, amounts and cards, plus noise.
const charges = MERCHANTS.flatMap((merchant, i) => [
  `Your card ending *${1000 + i} was charged EGP ${(i + 1) * 12.5} at ${merchant}. Available balance EGP ${5000 - i * 100}.00`,
  `Your card ending *${2000 + i} was charged EGP ${(i + 2) * 7} at ${merchant}. Available balance EGP ${4000 - i * 50}.25`,
])
const noise = ['Your one-time password is 482913. Do not share it.', 'Enjoy 10% off this weekend!']
const messages = [...charges, ...noise].map(sms)

const asPatterns = (learned: ReturnType<typeof learnBank>): Pattern[] =>
  learned.map((l) => ({ ...l, enabled: true, generated: l.pattern }))

describe('learnBank', () => {
  const learned = learnBank('test-bank', messages)

  it('learns a debit pattern for the charge template and nothing for the noise', () => {
    expect(learned).toHaveLength(1)
    expect(learned[0]).toMatchObject({ type: 'debit', messages: charges.length })
    expect(learned[0].id).toMatch(/^test-bank:[0-9a-f]{10}$/)
  })

  it('learns a pattern that extracts every message it was learned from', () => {
    const patterns = asPatterns(learned)
    charges.forEach((text, i) => {
      const x = extract('test-bank', patterns, text)
      expect(x, text).not.toBeNull()
      expect(x!.merchant).toBe(MERCHANTS[Math.floor(i / 2)])
      expect(x!.accountKey).toMatch(/^test-bank:\d{4}$/)
    })
  })

  it('gives the same template the same id across runs', () => {
    expect(learnBank('test-bank', [...messages].reverse()).map((l) => l.id)).toEqual(learned.map((l) => l.id))
  })
})

describe('mergePatterns', () => {
  const learned = learnBank('test-bank', messages)

  it('adds new patterns disabled', () => {
    const { file, added } = mergePatterns(undefined, 'test-bank', ['Test Bank'], learned)
    expect(added).toBe(learned.length)
    expect(file.patterns.every((p) => !p.enabled)).toBe(true)
  })

  it('keeps your edits and enabled flag, and marks vanished patterns missing', () => {
    const first = mergePatterns(undefined, 'test-bank', ['Test Bank'], learned).file
    const edited = {
      ...first,
      patterns: [
        { ...first.patterns[0], enabled: true, pattern: `${first.patterns[0].pattern} ` },
        { ...first.patterns[0], id: 'test-bank:gone' },
      ],
    }
    const { file, added, missing } = mergePatterns(edited, 'test-bank', ['Test Bank'], learned)
    expect(added).toBe(0)
    expect(missing).toBe(1)
    expect(file.patterns[0]).toMatchObject({ enabled: true, pattern: edited.patterns[0].pattern })
    expect(file.patterns.find((p) => p.id === 'test-bank:gone')).toMatchObject({ missing: true, messages: 0 })
  })
})
