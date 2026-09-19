import { describe, expect, it } from 'vitest'
import { compile, directionOf, extract, type Pattern } from '../../src/services/patterns/pattern'

const pattern = (over: Partial<Pattern> & Pick<Pattern, 'pattern'>): Pattern => ({
  id: 'bank:x',
  enabled: true,
  type: 'debit',
  generated: over.pattern,
  reason: '',
  messages: 0,
  ...over,
})

describe('compile', () => {
  it('rejects an unknown slot type or role', () => {
    expect(() => compile('Paid {amount:MONEY}')).toThrow(/unknown slot type/)
    expect(() => compile('Paid {price:NUM}')).toThrow(/unknown role/)
  })

  it('counts literal tokens', () => {
    expect(compile('Paid {amount:NUM} at {merchant:TEXT}').literals).toBe(2)
  })
})

describe('extract', () => {
  const charge = pattern({
    id: 'bank:charge',
    pattern:
      'Card {account:MASKED} charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Balance {:CUR} {balance:NUM}',
  })

  it('pulls every role out of a matching message', () => {
    const x = extract('bank', [charge], 'Card *4321 charged EGP 1,234.50 at ACME GROCERS. Balance EGP 10,000.00')
    expect(x).toEqual({
      patternId: 'bank:charge',
      type: 'debit',
      amount: '1,234.50',
      currency: 'EGP',
      balance: '10,000.00',
      merchant: 'ACME GROCERS',
      accountKey: 'bank:4321',
      reference: null,
    })
  })

  it('tolerates spacing the mask split apart ("bal.EGP10")', () => {
    const p = pattern({ pattern: 'Spent {currency:CUR} {amount:NUM} , bal . {:CUR} {balance:NUM}' })
    expect(extract('bank', [p], 'Spent EGP 5.00, bal.EGP10.00')?.balance).toBe('10.00')
  })

  it('normalises Arabic-Indic digits', () => {
    const p = pattern({ pattern: 'Spent {currency:CUR} {amount:NUM}' })
    expect(extract('bank', [p], 'Spent EGP ١٢٣')?.amount).toBe('123')
  })

  it('returns null when nothing matches the whole message', () => {
    expect(extract('bank', [charge], 'Your OTP is 123456')).toBeNull()
  })

  it('prefers the pattern with more literal words', () => {
    const loose = pattern({ id: 'bank:loose', pattern: '{description:TEXT} {currency:CUR} {amount:NUM}' })
    const tight = pattern({ id: 'bank:tight', pattern: 'Refund of {currency:CUR} {amount:NUM}', type: 'credit' })
    expect(extract('bank', [loose, tight], 'Refund of EGP 20')?.patternId).toBe('bank:tight')
    expect(extract('bank', [tight, loose], 'Refund of EGP 20')?.patternId).toBe('bank:tight')
  })

  it('reads direction from the {direction} slot for by-keyword patterns', () => {
    const p = pattern({
      type: 'by-keyword',
      pattern: 'Account {account:MASKED} {direction:TEXT} {currency:CUR} {amount:NUM}',
    })
    expect(extract('bank', [p], 'Account *1 debited EGP 5')?.type).toBe('debit')
    expect(extract('bank', [p], 'Account *1 credited EGP 5')?.type).toBe('credit')
    expect(extract('bank', [p], 'Account *1 moved EGP 5')?.type).toBeNull()
  })
})

describe('directionOf', () => {
  it('is null when both or neither direction words appear', () => {
    expect(directionOf('debited and credited')).toBeNull()
    expect(directionOf('hello')).toBeNull()
    expect(directionOf('خصم')).toBe('debit')
  })
})

describe('pattern details', () => {
  it('only treats a whole token as a slot', () => {
    // "x{amount:NUM}" and "{amount:NUM}x" are literal text, not slots.
    expect(compile('Paid x{amount:NUM}').roles).toEqual([])
    expect(compile('Paid {amount:NUM}x').roles).toEqual([])
  })

  it('splits the pattern on any run of whitespace', () => {
    expect(compile('Paid   {amount:NUM}').literals).toBe(1)
    const p = pattern({ pattern: 'Paid  {currency:CUR}   {amount:NUM}' })
    expect(extract('bank', [p], 'Paid EGP 5')?.amount).toBe('5')
  })

  it('keeps the first of two equally specific patterns', () => {
    const a = pattern({ id: 'bank:a', pattern: 'Paid {currency:CUR} {amount:NUM}' })
    const b = pattern({ id: 'bank:b', pattern: 'Paid {currency:CUR} {amount:NUM}', type: 'credit' })
    expect(extract('bank', [a, b], 'Paid EGP 5')?.patternId).toBe('bank:a')
  })

  it('compiles each pattern once', () => {
    const text = `Unique {amount:NUM} ${Math.random()}`
    expect(compile(text)).toBe(compile(text))
  })

  it('trims slot values and falls back from merchant to counterparty to description', () => {
    const merchantless = pattern({
      pattern: 'Sent {currency:CUR} {amount:NUM} to {counterparty:TEXT} ref {reference:ID}',
    })
    expect(extract('bank', [merchantless], 'Sent EGP 5 to  JANE DOE  ref AB12CD')).toMatchObject({
      merchant: 'JANE DOE',
      reference: 'AB12CD',
    })
    const described = pattern({ pattern: 'Paid {currency:CUR} {amount:NUM} ( {description:TEXT} )' })
    expect(extract('bank', [described], 'Paid EGP 5 (Cash)')?.merchant).toBe('Cash')
    const empty = pattern({ pattern: 'Paid {currency:CUR} {amount:NUM} at {merchant:TEXT} .' })
    expect(extract('bank', [empty], 'Paid EGP 5 at .')?.merchant).toBeNull()
  })

  it('keys the account by its last four digits', () => {
    const p = pattern({ pattern: 'Account {account:NUM} {currency:CUR} {amount:NUM}' })
    expect(extract('bank', [p], 'Account 123456789 EGP 5')?.accountKey).toBe('bank:6789')
  })

  it('reads direction for by-keyword patterns without a direction slot as unknown', () => {
    const p = pattern({ type: 'by-keyword', pattern: 'Moved {currency:CUR} {amount:NUM}' })
    expect(extract('bank', [p], 'Moved EGP 5')?.type).toBeNull()
  })

  it('recognises the Arabic credit word with either alef', () => {
    expect(directionOf('تمت إضافة')).toBe('credit')
    expect(directionOf('تمت اضافة')).toBe('credit')
    expect(directionOf('تمت ضافة')).toBeNull()
  })
})
