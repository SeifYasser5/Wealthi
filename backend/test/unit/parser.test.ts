import { describe, expect, it } from 'vitest'
import { createPatternParser, ParseError, parser } from '../../src/services/ingest/parser'
import type { Pattern } from '../../src/services/patterns/pattern'
import { classifyTransfer } from '../../src/services/ingest/transfer'
import type { DecodedMessage } from '../../src/utils/types'

// `parser` is built from test/fixtures/patterns and resolves accounts through
// test/fixtures/wealthi.test.json (see vitest.config.ts).

const message = (text: string, sender = 'Test Bank'): DecodedMessage => ({
  rowid: 1n,
  guid: 'g-1',
  messageDate: new Date('2026-01-10T12:00:00Z'),
  text,
  sender,
})

describe('parser', () => {
  it('turns a matching SMS into a transaction on the mapped account', () => {
    const r = parser(
      message('Your card ending *2222 was charged EGP 250.00 at ACME GROCERS. Available balance EGP 4,750.00'),
    )
    expect(r).toMatchObject({
      ok: true,
      patternId: 'test-bank:card-charge',
      value: {
        type: 'debit',
        amount: 250,
        currency: 'EGP',
        account: 'card',
        merchant: 'ACME GROCERS',
        reportedBalance: 4750,
      },
    })
  })

  it('skips a foreign-currency charge without reporting an error', () => {
    const r = parser(
      message('Your card ending *1111 was charged USD 20.00 at ONLINE STORE. Available balance EGP 1.00'),
    )
    expect(r).toMatchObject({ ok: false, skipped: true })
  })

  it.each([
    ['an OTP', 'Your one-time password is 482913.', 'no enabled pattern matched'],
    ['a disabled pattern', 'Cash withdrawal of EGP 300.00 from *1111', 'no enabled pattern matched'],
    [
      'an unmapped card',
      'Your card ending *9999 was charged EGP 1.00 at X. Available balance EGP 1.00',
      'no account mapped for source "test-bank:9999"',
    ],
  ])('reports %s as a parse error', (_, text, cause) => {
    const r = parser(message(text))
    expect(r.ok).toBe(false)
    if (r.ok || r.skipped) throw new Error('expected a parse error')
    expect(r.error.cause).toContain(cause)
  })

  it('reports an unknown sender', () => {
    const r = createPatternParser([])(message('anything', 'Stranger'))
    expect(r).toMatchObject({ ok: false, skipped: false })
  })
})

describe('parser rejections', () => {
  const only = (pattern: string, type: Pattern['type'] = 'debit') =>
    createPatternParser([
      {
        bank: 'test-bank',
        senders: ['Test Bank'],
        patterns: [{ id: 'test-bank:p', enabled: true, type, pattern, generated: pattern, reason: '', messages: 0 }],
      },
    ])
  const cause = (r: ReturnType<typeof parser>) => {
    if (r.ok || r.skipped) throw new Error('expected a parse error')
    return r.error.cause
  }

  it.each([
    [
      'no direction',
      'by-keyword',
      'Card {account:MASKED} {direction:TEXT} {currency:CUR} {amount:NUM}',
      'Card *1111 moved EGP 5',
      'could not tell debit from credit',
    ],
    ['no amount slot', 'debit', 'Card {account:MASKED} charged {currency:CUR}', 'Card *1111 charged EGP', 'no amount'],
    [
      'no currency slot',
      'debit',
      'Card {account:MASKED} charged {amount:NUM}',
      'Card *1111 charged 5',
      'unknown currency "null"',
    ],
    [
      'no account slot',
      'debit',
      'Charged {currency:CUR} {amount:NUM}',
      'Charged EGP 5',
      'no account number in message',
    ],
  ] as const)('reports %s', (_, type, pattern, text, expected) => {
    expect(cause(only(pattern, type)(message(text)))).toBe(`pattern test-bank:p: ${expected}`)
  })

  it('maps Arabic currency words and keeps EUR out of EGP/USD accounts', () => {
    const p = only('Card {account:MASKED} {currency:CUR} {amount:NUM}')
    expect(p(message('Card *1111 جم 5'))).toMatchObject({ ok: true, value: { currency: 'EGP' } })
    expect(p(message('Card *1111 EUR 5'))).toMatchObject({
      ok: false,
      skipped: true,
      reason: expect.stringMatching(/EUR amount on EGP account checking/),
    })
  })

  it('carries the message identity onto the transaction', () => {
    const r = parser({
      ...message('Account *1111 credited with EGP 1.00 from X. Balance EGP 2.00'),
      rowid: 42n,
      guid: 'g-42',
    })
    expect(r).toMatchObject({
      ok: true,
      value: {
        messageGuid: 'g-42',
        sourceRowid: 42n,
        counterAccount: null,
        transactedAt: new Date('2026-01-10T12:00:00Z'),
      },
    })
  })
})

describe('ParseError', () => {
  it('names the parser, the cause and the start of the text', () => {
    const e = new ParseError('patterns', 'x'.repeat(100), 'why')
    expect(e.name).toBe('ParseError')
    expect(e.message).toBe(`[patterns] failed to parse (why): ${'x'.repeat(80)}`)
  })

  it('leaves a non-string cause out of the message but keeps it', () => {
    const cause = new Error('inner')
    const e = new ParseError('patterns', 'text', cause)
    expect(e.message).toBe('[patterns] failed to parse: text')
    expect(e.cause).toBe(cause)
  })
})

describe('classifyTransfer', () => {
  it('matches a rule without a merchant on any merchant', () => {
    const r = parser(message('Account *3333 credited with USD 10.00 from ANYONE. Balance USD 10.00'))
    if (!r.ok) throw new Error('expected a match')
    expect(classifyTransfer(r.value).counterAccount).toBe('checking')
  })

  it('leaves a leg that already has a counter account alone', () => {
    const r = parser(message('Account *1111 debited EGP 250.00 for CARD PAYMENT. Balance EGP 5,750.00'))
    if (!r.ok) throw new Error('expected a match')
    const tagged = { ...r.value, counterAccount: 'savings_usd' }
    expect(classifyTransfer(tagged)).toBe(tagged)
  })

  it('needs account and direction to match too', () => {
    const r = parser(message('Account *1111 credited with EGP 250.00 from CARD PAYMENT. Balance EGP 1.00'))
    if (!r.ok) throw new Error('expected a match')
    expect(classifyTransfer(r.value).counterAccount).toBeNull()
  })

  it('tags a leg matching a transfer rule and leaves others alone', () => {
    const r = parser(message('Account *1111 debited EGP 250.00 for CARD PAYMENT. Balance EGP 5,750.00'))
    if (!r.ok) throw new Error('expected a match')
    expect(classifyTransfer(r.value).counterAccount).toBe('card')
    expect(classifyTransfer({ ...r.value, merchant: 'SOMEONE ELSE' }).counterAccount).toBeNull()
  })
})

describe('parser error text', () => {
  it('names the parser and the unknown sender', () => {
    const r = createPatternParser([])(message('anything', 'Stranger'))
    if (r.ok || r.skipped) throw new Error('expected a parse error')
    expect(r.error.cause).toBe('no pattern file for sender "Stranger"')
    expect(r.error.message).toMatch(/^\[patterns\] failed to parse/)
  })
})
