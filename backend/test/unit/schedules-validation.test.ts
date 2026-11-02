import { describe, expect, it } from 'vitest'
import { fixtureAccounts } from '../fixtures/settings'
import { parseScheduleId, parseScheduleRequest } from '../../src/validation/schedules'

const valid = () => ({
  type: 'debit',
  amount: 1500.5,
  account: 'checking',
  merchant: 'RENT',
  categoryId: null,
  frequency: 'monthly',
  interval: 1,
  startDate: '2026-01-31',
  endDate: null,
})

const error = (body: unknown) => {
  const parsed = parseScheduleRequest(body, fixtureAccounts)
  return 'error' in parsed ? parsed.error : null
}

describe('parseScheduleRequest', () => {
  it('reads the amount into minor units and takes the currency from the account', () => {
    expect(parseScheduleRequest(valid(), fixtureAccounts)).toEqual({
      value: { ...valid(), amount: 150050, currency: 'EGP' },
    })
    expect(parseScheduleRequest({ ...valid(), account: 'savings_usd' }, fixtureAccounts)).toMatchObject({
      value: { currency: 'USD' },
    })
  })

  it('trims the merchant and accepts a category, an interval and an end date', () => {
    const body = { ...valid(), merchant: '  GYM ', categoryId: 4, interval: 2, endDate: '2026-12-31' }
    expect(parseScheduleRequest(body, fixtureAccounts)).toMatchObject({
      value: { merchant: 'GYM', categoryId: 4, interval: 2, endDate: '2026-12-31' },
    })
  })

  it('accepts an end date on the start date', () => {
    expect(error({ ...valid(), endDate: '2026-01-31' })).toBeNull()
  })

  it.each([
    [{ type: 'transfer' }, 'type must be one of: debit, credit'],
    [{ amount: '10' }, 'amount must be a number'],
    [{ amount: 0 }, 'amount must be more than 0'],
    [{ amount: -5 }, 'amount must be more than 0'],
    [{ amount: 1.005 }, 'amount must have at most 2 decimal places and be less than 10,000,000,000'],
    [{ amount: 1e13 }, 'amount must have at most 2 decimal places and be less than 10,000,000,000'],
    [{ account: 'nope' }, 'account must be one of: checking, card, savings_usd'],
    [{ account: undefined }, 'account is required'],
    [{ merchant: '   ' }, 'merchant is required'],
    [{ merchant: 7 }, 'merchant must be a string'],
    [{ merchant: 'x'.repeat(101) }, 'merchant must be at most 100 characters'],
    [{ categoryId: undefined }, 'categoryId is required (use null for none)'],
    [{ categoryId: 0 }, 'categoryId must be a category id (a positive integer)'],
    [{ categoryId: 'Rent' }, 'categoryId must be a category id (a positive integer)'],
    [{ frequency: 'hourly' }, 'frequency must be one of: daily, weekly, monthly, yearly'],
    [{ interval: 0 }, 'interval must be a whole number from 1 to 999'],
    [{ interval: 1000 }, 'interval must be a whole number from 1 to 999'],
    [{ interval: 1.5 }, 'interval must be a whole number from 1 to 999'],
    [{ startDate: '2026-02-30' }, 'startDate must be a date (YYYY-MM-DD)'],
    [{ startDate: undefined }, 'startDate must be a date (YYYY-MM-DD)'],
    [{ endDate: '31/12/2026' }, 'endDate must be a date (YYYY-MM-DD)'],
    [{ endDate: undefined }, 'endDate must be a date (YYYY-MM-DD)'],
    [{ endDate: '2026-01-30' }, 'endDate must not be before startDate'],
  ])('rejects %j', (change, message) => {
    expect(error({ ...valid(), ...change })).toBe(message)
  })

  it('rejects a body that is not an object', () => {
    expect(error(null)).toBe('body must be a schedule')
    expect(error([])).toBe('body must be a schedule')
  })

  it('reports the first bad field', () => {
    expect(error({ ...valid(), type: 'x', amount: -1 })).toBe('type must be one of: debit, credit')
  })
})

describe('parseScheduleId', () => {
  it('reads a positive integer', () => {
    expect(parseScheduleId('12')).toEqual({ value: 12 })
  })

  it.each(['0', '-1', '1e3', ' 7', 'abc', '99999999999', '2147483648', undefined])('rejects %j', (id) => {
    expect(parseScheduleId(id)).toEqual({ error: 'id must be a schedule id (a positive integer)' })
  })
})
