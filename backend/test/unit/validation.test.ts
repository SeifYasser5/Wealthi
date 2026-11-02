import { describe, expect, it } from 'vitest'
import { fixtureAccounts } from '../fixtures/settings'
import { parsePatternStatusUpdate } from '../../src/validation/patterns'
import { parseTransactionFilters } from '../../src/validation/transactions'
import {
  parseCategoryId,
  parseCategoryRequest,
  parseCategoryUpdate,
  parseMerchantCategory,
  parseReorder,
} from '../../src/validation/categories'

const ID = '0b6c7d2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

describe('parseTransactionFilters', () => {
  it('accepts every filter and drops unknown params', () => {
    expect(
      parseTransactionFilters(
        {
          yearMonth: '2026-01',
          account: 'checking',
          merchant: 'acme',
          type: 'debit',
          transfer: 'only',
          counterAccount: 'card',
          page: '2',
        },
        fixtureAccounts,
      ),
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
    expect(parseTransactionFilters({}, fixtureAccounts)).toEqual({ value: {} })
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
    expect(parseTransactionFilters(query, fixtureAccounts)).toEqual({ error })
  })

  it('reports only the first bad param', () => {
    expect(parseTransactionFilters({ yearMonth: 'x', account: 'y' }, fixtureAccounts)).toEqual({
      error: 'yearMonth must be in YYYY-MM format',
    })
  })
})

describe('parseCategoryUpdate', () => {
  it('accepts a category id, or null to clear', () => {
    expect(parseCategoryUpdate(ID, { categoryId: 3 })).toEqual({ value: { id: ID, categoryId: 3 } })
    expect(parseCategoryUpdate(ID, { categoryId: null })).toEqual({ value: { id: ID, categoryId: null } })
  })

  const badId = 'categoryId must be a category id (a positive integer)'
  it.each([
    ['a bad id', 'not-a-uuid', { categoryId: 1 }, 'id must be a UUID'],
    ['a missing body', ID, undefined, 'categoryId is required (use null to clear it)'],
    ['a body without categoryId', ID, {}, 'categoryId is required (use null to clear it)'],
    ['a category name', ID, { categoryId: 'Rent' }, badId],
    ['a numeric string', ID, { categoryId: '3' }, badId],
    ['zero', ID, { categoryId: 0 }, badId],
    ['a fraction', ID, { categoryId: 1.5 }, badId],
    ['an id past INTEGER', ID, { categoryId: 2 ** 31 }, badId],
  ])('rejects %s', (_, id, body, error) => {
    expect(parseCategoryUpdate(id, body)).toEqual({ error })
  })
})

describe('parseCategoryId', () => {
  it('reads a path id into a number', () => {
    expect(parseCategoryId('42')).toEqual({ value: 42 })
  })

  it.each(['0', '-1', '1.5', '1e3', ' 7', 'abc', '2147483648', '12345678901', undefined])('rejects %s', (id) => {
    expect(parseCategoryId(id)).toEqual({ error: 'id must be a category id (a positive integer)' })
  })
})

describe('parseCategoryRequest', () => {
  it('trims the name', () => {
    expect(parseCategoryRequest({ name: '  Travel ' })).toEqual({ value: { name: 'Travel' } })
  })

  it.each([
    [undefined, 'body must be { name }'],
    [{}, 'name must be a string'],
    [{ name: 3 }, 'name must be a string'],
    [{ name: '   ' }, 'name is required'],
    [{ name: 'x'.repeat(41) }, 'name must be at most 40 characters'],
  ])('rejects %j', (body, error) => {
    expect(parseCategoryRequest(body)).toEqual({ error })
  })
})

describe('parseReorder', () => {
  it('accepts a list of ids, empty included', () => {
    expect(parseReorder({ ids: [3, 1, 2] })).toEqual({ value: { ids: [3, 1, 2] } })
    expect(parseReorder({ ids: [] })).toEqual({ value: { ids: [] } })
  })

  it.each([
    [null, 'body must be { ids }'],
    [{ ids: 'all' }, 'ids must be an array of category ids'],
    [{ ids: [1, 'b'] }, 'each id must be a category id (a positive integer)'],
    [{ ids: [1, 1] }, 'ids must not repeat'],
  ])('rejects %j', (body, error) => {
    expect(parseReorder(body)).toEqual({ error })
  })
})

describe('parseMerchantCategory', () => {
  it('keeps the merchant exactly as sent, and accepts null to unmap', () => {
    expect(parseMerchantCategory({ merchant: ' CAFE ', categoryId: 2 })).toEqual({
      value: { merchant: ' CAFE ', categoryId: 2 },
    })
    expect(parseMerchantCategory({ merchant: 'CAFE', categoryId: null })).toEqual({
      value: { merchant: 'CAFE', categoryId: null },
    })
  })

  it.each([
    ['a missing body', undefined, 'body must be { merchant, categoryId }'],
    ['a missing merchant', { categoryId: 1 }, 'merchant must be a string'],
    ['an empty merchant', { merchant: '', categoryId: 1 }, 'merchant is required'],
    ['a missing categoryId', { merchant: 'CAFE' }, 'categoryId must be a category id (a positive integer)'],
    ['a bad categoryId', { merchant: 'CAFE', categoryId: -1 }, 'categoryId must be a category id (a positive integer)'],
  ])('rejects %s', (_, body, error) => {
    expect(parseMerchantCategory(body)).toEqual({ error })
  })
})

describe('validation edge cases', () => {
  it('accepts transfer=exclude on its own', () => {
    expect(parseTransactionFilters({ transfer: 'exclude' }, fixtureAccounts)).toEqual({
      value: { transfer: 'exclude' },
    })
  })

  it('rejects a null body', () => {
    expect(parseCategoryUpdate(ID, null)).toEqual({ error: 'categoryId is required (use null to clear it)' })
  })
})

describe('parsePatternStatusUpdate', () => {
  it('accepts either list, defaulting the other to empty', () => {
    expect(parsePatternStatusUpdate({ enable: ['a:1'], disable: ['a:2', 'a:3'] })).toEqual({
      value: { enable: ['a:1'], disable: ['a:2', 'a:3'] },
    })
    expect(parsePatternStatusUpdate({ enable: ['a:1'] })).toEqual({ value: { enable: ['a:1'], disable: [] } })
    expect(parsePatternStatusUpdate({ disable: ['a:1'] })).toEqual({ value: { enable: [], disable: ['a:1'] } })
  })

  it.each([
    ['no body', undefined, 'body must be { enable?, disable? }'],
    ['a non-object body', 'a:1', 'body must be { enable?, disable? }'],
    ['nothing to change', { enable: [], disable: [] }, 'name at least one pattern to enable or disable'],
    ['a lone id instead of a list', { enable: 'a:1' }, 'enable must be an array of pattern ids'],
    ['a non-string id', { disable: [1] }, 'disable must be an array of pattern ids'],
    ['an empty id', { enable: [''] }, 'enable holds an empty id'],
    ['an id in both lists', { enable: ['a:1'], disable: ['a:1'] }, 'a pattern cannot be both enabled and disabled'],
  ])('rejects %s', (_, body, error) => {
    expect(parsePatternStatusUpdate(body)).toEqual({ error })
  })
})
