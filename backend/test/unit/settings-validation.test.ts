import { describe, expect, it } from 'vitest'
import {
  parseAccountRequest,
  parseAccountSourceRequest,
  parseAccountUpdate,
  parseBankSenderRequest,
  parseSenderParam,
  parseSourceParam,
  parseTransferRuleId,
  parseTransferRuleRequest,
} from '../../src/validation/settings'

const account = () => ({ id: 'checking', label: 'Checking', currency: 'EGP', openingBalance: 1000.5 })

const error = <T>(parsed: { value: T } | { error: string }) => ('error' in parsed ? parsed.error : null)

describe('parseAccountRequest', () => {
  it('reads the opening balance into minor units, negative included', () => {
    expect(parseAccountRequest(account())).toEqual({ value: { ...account(), openingBalance: 100050 } })
    expect(parseAccountRequest({ ...account(), openingBalance: -20 })).toMatchObject({
      value: { openingBalance: -2000 },
    })
  })

  it('trims the label', () => {
    expect(parseAccountRequest({ ...account(), label: '  Main ' })).toMatchObject({ value: { label: 'Main' } })
  })

  it.each([
    [{ id: 'has space' }, 'id must be 1 to 40 letters, digits, "_" or "-"'],
    [{ id: '' }, 'id must be 1 to 40 letters, digits, "_" or "-"'],
    [{ id: 7 }, 'id must be 1 to 40 letters, digits, "_" or "-"'],
    [{ label: '  ' }, 'label is required'],
    [{ label: 'x'.repeat(61) }, 'label must be at most 60 characters'],
    [{ currency: 'GBP' }, 'currency must be one of: EGP, USD'],
    [{ openingBalance: '5' }, 'openingBalance must be a number'],
    [
      { openingBalance: 1.005 },
      'openingBalance must have at most 2 decimal places and be less than 10,000,000,000 in size',
    ],
  ])('rejects %j', (change, message) => {
    expect(error(parseAccountRequest({ ...account(), ...change }))).toBe(message)
  })

  it('rejects a body that is not an object', () => {
    expect(error(parseAccountRequest('x'))).toBe('body must be an account')
  })
})

describe('parseAccountUpdate', () => {
  it('takes only the label and the opening balance', () => {
    expect(parseAccountUpdate({ label: ' Main ', openingBalance: 5, id: 'ignored' })).toEqual({
      value: { label: 'Main', openingBalance: 500 },
    })
  })

  it('rejects a bad body', () => {
    expect(error(parseAccountUpdate({ label: '', openingBalance: 5 }))).toBe('label is required')
    expect(error(parseAccountUpdate(null))).toBe('body must be { label, openingBalance }')
  })
})

describe('parseAccountSourceRequest and parseSourceParam', () => {
  it('trims the source key', () => {
    expect(parseAccountSourceRequest({ source: ' bank:1234 ', account: 'checking' })).toEqual({
      value: { source: 'bank:1234', account: 'checking' },
    })
    expect(parseSourceParam('bank:1234')).toEqual({ value: 'bank:1234' })
  })

  it.each([
    [{ source: ' ', account: 'a' }, 'source is required'],
    [{ source: 'x'.repeat(101), account: 'a' }, 'source must be at most 100 characters'],
    [{ source: 5, account: 'a' }, 'source must be a string'],
    [{ source: 'bank:1' }, 'account is required'],
    [{ source: 'bank:1', account: '' }, 'account is required'],
    [undefined, 'body must be { source, account }'],
  ])('rejects %j', (body, message) => {
    expect(error(parseAccountSourceRequest(body))).toBe(message)
  })

  it('rejects an empty path param', () => {
    expect(error(parseSourceParam(''))).toBe('source is required')
  })
})

describe('parseTransferRuleRequest', () => {
  const rule = () => ({ account: 'checking', type: 'debit', merchant: 'CARD PAYMENT', counterAccount: 'card' })

  it('accepts a rule, an empty merchant meaning any, and keeps the merchant exact', () => {
    expect(parseTransferRuleRequest(rule())).toEqual({ value: rule() })
    expect(parseTransferRuleRequest({ ...rule(), merchant: '' })).toMatchObject({ value: { merchant: '' } })
    expect(parseTransferRuleRequest({ ...rule(), merchant: ' PAD ' })).toMatchObject({ value: { merchant: ' PAD ' } })
  })

  it.each([
    [{ account: undefined }, 'account is required'],
    [{ type: 'transfer' }, 'type must be one of: debit, credit'],
    [{ merchant: 3 }, 'merchant must be a string (empty matches any merchant)'],
    [{ merchant: 'x'.repeat(101) }, 'merchant must be at most 100 characters'],
    [{ counterAccount: '' }, 'counterAccount is required'],
    [{ counterAccount: 'checking' }, 'counterAccount must differ from account'],
  ])('rejects %j', (change, message) => {
    expect(error(parseTransferRuleRequest({ ...rule(), ...change }))).toBe(message)
  })

  it('rejects a body that is not an object', () => {
    expect(error(parseTransferRuleRequest(null))).toBe('body must be a transfer rule')
  })
})

describe('parseTransferRuleId', () => {
  it('reads a positive integer path param', () => {
    expect(parseTransferRuleId('12')).toEqual({ value: 12 })
  })

  it.each(['0', '1e3', ' 7', '-1', 'x', '99999999999', undefined])('rejects %j', (id) => {
    expect(error(parseTransferRuleId(id))).toBe('id must be a transfer rule id (a positive integer)')
  })
})

describe('parseBankSenderRequest and parseSenderParam', () => {
  it('trims the sender, which can be a name or a phone number', () => {
    expect(parseBankSenderRequest({ sender: ' My Bank ' })).toEqual({ value: 'My Bank' })
    expect(parseBankSenderRequest({ sender: '+15550001111' })).toEqual({ value: '+15550001111' })
    expect(parseSenderParam('+15550001111')).toEqual({ value: '+15550001111' })
  })

  it.each([
    [{ sender: '  ' }, 'sender is required'],
    [{ sender: 4 }, 'sender must be a string'],
    [{ sender: 'x'.repeat(101) }, 'sender must be at most 100 characters'],
    [null, 'body must be { sender }'],
  ])('rejects %j', (body, message) => {
    expect(error(parseBankSenderRequest(body))).toBe(message)
  })

  it('rejects a bad path param', () => {
    expect(error(parseSenderParam(''))).toBe('sender is required')
    expect(error(parseSenderParam(5))).toBe('sender must be a string')
  })
})
