import { describe, expect, it } from 'vitest'
import { ParseError, parser } from '../../src/services/ingest/parser'
import {
  MAX_MINOR,
  decimalToMinor,
  minorToDecimal,
  minorToNumber,
  numberToMinor,
  parseMinor,
  type Minor,
} from '../../src/utils/money'

const ok = (value: number) => ({ ok: true, value })
const minor = (n: number) => n as Minor

describe('parseMinor', () => {
  it('parses a plain two-decimal amount', () => {
    expect(parseMinor('250.00')).toEqual(ok(25000))
    expect(parseMinor('0.07')).toEqual(ok(7))
  })

  it('parses thousands separators, comma or whitespace', () => {
    expect(parseMinor('1,234.50')).toEqual(ok(123450))
    expect(parseMinor('1,323,558')).toEqual(ok(132355800))
    expect(parseMinor('3 000.00')).toEqual(ok(300000))
  })

  it('parses an amount with no decimal part', () => {
    expect(parseMinor('42')).toEqual(ok(4200))
    expect(parseMinor('0')).toEqual(ok(0))
  })

  it('pads one decimal digit to two', () => {
    expect(parseMinor('5000.5')).toEqual(ok(500050))
  })

  it('accepts extra decimal places only when they are zeros', () => {
    expect(parseMinor('5.000')).toEqual(ok(500))
    expect(parseMinor('1.2300')).toEqual(ok(123))
    expect(parseMinor('1.005')).toEqual({ ok: false, error: 'more than 2 decimal places in "1.005"' })
  })

  it('parses a negative amount without producing -0', () => {
    expect(parseMinor('-160.19')).toEqual(ok(-16019))
    expect(Object.is((parseMinor('-0.00') as { value: number }).value, 0)).toBe(true)
  })

  it('never goes through a float', () => {
    // parseFloat('1.15') * 100 is 114.99999999999999
    expect(parseMinor('1.15')).toEqual(ok(115))
    expect(parseMinor('9,999,999,999.99')).toEqual(ok(999999999999))
  })

  it('rejects Arabic-Indic digits (callers normalize them first)', () => {
    expect(parseMinor('١٢٣').ok).toBe(false)
  })

  it.each([
    [''],
    ['abc'],
    ['12 EGP'],
    ['$5'],
    ['+5'],
    ['.5'],
    ['5.'],
    ['1.2.3'],
    ['1e3'],
    ['0x10'],
    ['1,23'],
    ['12,34.5'],
    ['1,,234'],
    [' 5'],
    ['--5'],
    ['Infinity'],
  ])('rejects %j', (text) => {
    expect(parseMinor(text)).toEqual({ ok: false, error: `invalid amount "${text}"` })
  })

  it('rejects an amount too large to hold exactly', () => {
    expect(parseMinor('99999999999999999')).toEqual({ ok: false, error: 'amount out of range "99999999999999999"' })
  })

  it('accepts the largest amount a DECIMAL(12,2) column holds', () => {
    expect(MAX_MINOR).toBe(999999999999)
    expect(parseMinor('9,999,999,999.99')).toEqual(ok(MAX_MINOR))
    expect(parseMinor('-9999999999.99')).toEqual(ok(-MAX_MINOR))
  })

  it('rejects the smallest amount a DECIMAL(12,2) column does not hold', () => {
    expect(parseMinor('10,000,000,000.00')).toEqual({ ok: false, error: 'amount out of range "10,000,000,000.00"' })
    expect(parseMinor('-10000000000')).toEqual({ ok: false, error: 'amount out of range "-10000000000"' })
  })

  describe('through the SMS parser', () => {
    // The fixture pattern test-bank:card-charge, on the card mapped to an EGP account.
    const sms = (amount: string) =>
      parser({
        rowid: 1n,
        guid: 'g-1',
        messageDate: new Date('2026-01-10T12:00:00Z'),
        text: `Your card ending *2222 was charged EGP ${amount} at ACME GROCERS. Available balance EGP 1.00`,
        sender: 'Test Bank',
      })

    it('parses the largest amount that fits', () => {
      expect(sms('9,999,999,999.99')).toMatchObject({ ok: true, value: { amount: MAX_MINOR } })
    })

    it('turns the smallest amount that does not fit into a ParseError, not a throw', () => {
      const r = sms('10,000,000,000.00')
      if (r.ok || r.skipped) throw new Error('expected a parse error')
      expect(r.error).toBeInstanceOf(ParseError)
      expect(r.error.cause).toBe('pattern test-bank:card-charge: amount out of range "10,000,000,000.00"')
    })
  })
})

describe('numberToMinor', () => {
  it('parses the number as written', () => {
    expect(numberToMinor(12.5)).toEqual(ok(1250))
    expect(numberToMinor(1.15)).toEqual(ok(115))
    expect(numberToMinor(-3)).toEqual(ok(-300))
  })

  it('rejects a number with sub-cent precision', () => {
    expect(numberToMinor(0.001).ok).toBe(false)
  })
})

describe('minorToDecimal', () => {
  it.each([
    [123450, '1234.50'],
    [5, '0.05'],
    [0, '0.00'],
    [-14000, '-140.00'],
    [-5, '-0.05'],
  ])('%d → %s', (m, s) => {
    expect(minorToDecimal(minor(m))).toBe(s)
  })
})

describe('decimalToMinor', () => {
  it('reads the two-place string of a DECIMAL', () => {
    expect(decimalToMinor({ toFixed: () => '-140.00' })).toBe(-14000)
  })

  it('throws on a value no DECIMAL(12,2) holds', () => {
    expect(() => decimalToMinor({ toFixed: () => 'NaN' })).toThrow(/unexpected DECIMAL value/)
  })
})

describe('minorToNumber', () => {
  it('gives the same number as reading the decimal string', () => {
    for (const m of [0, 1, 115, 123450, -16019, 999999999999]) {
      expect(minorToNumber(minor(m))).toBe(Number(minorToDecimal(minor(m))))
    }
  })
})
