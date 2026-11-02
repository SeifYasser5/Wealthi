import { describe, expect, it } from 'vitest'
import { fixtureAccounts } from '../fixtures/settings'
import { parseManualTransactionId, parseManualTransactionRequest } from '../../src/validation/manual-transactions'

const valid = () => ({
  type: 'debit',
  amount: 50.5,
  account: 'checking',
  merchant: 'Bank fee',
  categoryId: null,
  date: '2026-01-15',
})

const error = (body: unknown) => {
  const parsed = parseManualTransactionRequest(body, fixtureAccounts)
  return 'error' in parsed ? parsed.error : null
}

describe('parseManualTransactionRequest', () => {
  it('reads the amount into minor units and takes the currency from the account', () => {
    expect(parseManualTransactionRequest(valid(), fixtureAccounts)).toEqual({
      value: { ...valid(), amount: 5050, currency: 'EGP' },
    })
    expect(parseManualTransactionRequest({ ...valid(), account: 'savings_usd' }, fixtureAccounts)).toMatchObject({
      value: { currency: 'USD' },
    })
  })

  it('trims the merchant and accepts a category', () => {
    expect(
      parseManualTransactionRequest({ ...valid(), merchant: '  Fee ', categoryId: 4 }, fixtureAccounts),
    ).toMatchObject({
      value: { merchant: 'Fee', categoryId: 4 },
    })
  })

  it.each([
    [{ type: 'transfer' }, 'type must be one of: debit, credit'],
    [{ amount: '10' }, 'amount must be a number'],
    [{ amount: 0 }, 'amount must be more than 0'],
    [{ amount: 1.005 }, 'amount must have at most 2 decimal places and be less than 10,000,000,000'],
    [{ account: 'nope' }, 'account must be one of: checking, card, savings_usd'],
    [{ account: undefined }, 'account is required'],
    [{ merchant: '   ' }, 'merchant is required'],
    [{ merchant: 7 }, 'merchant must be a string'],
    [{ merchant: 'x'.repeat(101) }, 'merchant must be at most 100 characters'],
    [{ categoryId: undefined }, 'categoryId is required (use null for none)'],
    [{ categoryId: 0 }, 'categoryId must be a category id (a positive integer)'],
    [{ date: '2026-02-30' }, 'date must be a date (YYYY-MM-DD)'],
    [{ date: undefined }, 'date must be a date (YYYY-MM-DD)'],
  ])('rejects %j', (change, message) => {
    expect(error({ ...valid(), ...change })).toBe(message)
  })

  it('rejects a body that is not an object', () => {
    expect(error(null)).toBe('body must be a manual transaction')
  })
})

describe('parseManualTransactionId', () => {
  it('reads a positive integer', () => {
    expect(parseManualTransactionId('12')).toEqual({ value: 12 })
  })

  it.each(['0', '1e3', ' 7', 'abc', '2147483648', undefined])('rejects %j', (id) => {
    expect(parseManualTransactionId(id)).toEqual({ error: 'id must be a manual transaction id (a positive integer)' })
  })
})
