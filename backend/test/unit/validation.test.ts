import { describe, expect, it } from 'vitest'
import { parseCategoryUpdate, parseTransactionFilters } from '../../src/validation/transactions'

const ID = '0b6c7d2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

describe('parseTransactionFilters', () => {
  it('accepts every filter and drops unknown params', () => {
    expect(
      parseTransactionFilters({
        yearMonth: '2026-01',
        account: 'checking',
        merchant: 'acme',
        type: 'debit',
        transfer: 'only',
        counterAccount: 'card',
        page: '2',
      }),
    ).toEqual({
      value: {
        yearMonth: '2026-01',
        account: 'checking',
        merchant: 'acme',
        type: 'debit',
        transfer: 'only',
        counterAccount: 'card',
      },
    })
    expect(parseTransactionFilters({})).toEqual({ value: {} })
  })

  it.each([
    [{ yearMonth: '2026-13-01' }, 'yearMonth must be in YYYY-MM format'],
    [{ yearMonth: ['2026-01', '2026-02'] }, 'yearMonth must be in YYYY-MM format'],
    [{ account: 'nope' }, 'account must be one of: checking, card, savings_usd'],
    [{ counterAccount: 'nope' }, 'counterAccount must be one of: checking, card, savings_usd'],
    [{ merchant: ['a', 'b'] }, 'merchant must be a string'],
    [{ type: 'transfer' }, 'type must be one of: debit, credit'],
    [{ transfer: 'yes' }, 'transfer must be one of: only, exclude'],
    [{ counterAccount: 'card', transfer: 'exclude' }, 'counterAccount cannot be combined with transfer=exclude'],
  ])('rejects %j', (query, error) => {
    expect(parseTransactionFilters(query)).toEqual({ error })
  })

  it('reports only the first bad param', () => {
    expect(parseTransactionFilters({ yearMonth: 'x', account: 'y' })).toEqual({
      error: 'yearMonth must be in YYYY-MM format',
    })
  })
})

describe('parseCategoryUpdate', () => {
  it('accepts a known category, trimmed', () => {
    expect(parseCategoryUpdate(ID, { category: ' Rent ' })).toEqual({ value: { id: ID, category: 'Rent' } })
  })

  it('treats null, empty and whitespace as clearing', () => {
    for (const category of [null, '', '   ']) {
      expect(parseCategoryUpdate(ID, { category })).toEqual({ value: { id: ID, category: null } })
    }
  })

  it.each([
    ['a bad id', 'not-a-uuid', { category: 'Rent' }, 'id must be a UUID'],
    ['a missing body', ID, undefined, 'category is required (use null to clear it)'],
    ['a body without category', ID, {}, 'category is required (use null to clear it)'],
    ['a non-string category', ID, { category: 5 }, 'category must be a string or null'],
    ['an unknown category', ID, { category: 'Yachts' }, 'category must be null or one of: Dining, Groceries, Rent'],
    [
      'a category differing in case',
      ID,
      { category: 'rent' },
      'category must be null or one of: Dining, Groceries, Rent',
    ],
  ])('rejects %s', (_, id, body, error) => {
    expect(parseCategoryUpdate(id, body)).toEqual({ error })
  })
})

describe('validation edge cases', () => {
  it('accepts transfer=exclude on its own', () => {
    expect(parseTransactionFilters({ transfer: 'exclude' })).toEqual({ value: { transfer: 'exclude' } })
  })

  it('rejects a null body', () => {
    expect(parseCategoryUpdate(ID, null)).toEqual({ error: 'category is required (use null to clear it)' })
  })
})
