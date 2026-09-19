import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { isYearMonth, macDateToJs, monthRange, round2, route, toYearMonth } from '../../src/utils/helpers'
import {
  MERCHANT_CATEGORIES,
  SPENDING_CATEGORIES,
  isSpendingCategory,
  resolveCategory,
} from '../../src/utils/categories'
import { toMacDate } from '../fixtures/chat-db'

describe('macDateToJs', () => {
  it('converts nanoseconds since 2001 from a bigint or a number', () => {
    const date = new Date('2026-05-06T07:08:09.123Z')
    expect(macDateToJs(toMacDate(date)).toISOString()).toBe(date.toISOString())
    expect(macDateToJs(0).toISOString()).toBe('2001-01-01T00:00:00.000Z')
  })
})

describe('year-month helpers', () => {
  it('isYearMonth accepts only "YYYY-MM" strings', () => {
    expect(isYearMonth('2026-01')).toBe(true)
    for (const bad of ['2026-1', '2026-01-01', ' 2026-01', 202601, null, undefined])
      expect(isYearMonth(bad)).toBe(false)
  })

  it('toYearMonth uses local time', () => {
    expect(toYearMonth(new Date(2026, 11, 31, 23, 59))).toBe('2026-12')
    expect(toYearMonth(new Date(2026, 0, 1, 0, 0))).toBe('2026-01')
  })

  it('monthRange is inclusive and crosses years', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(monthRange('2026-03', '2026-03')).toEqual(['2026-03'])
    expect(monthRange('2026-04', '2026-03')).toEqual([])
  })

  it('round2 removes float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(2.456)).toBe(2.46)
    expect(round2(-1.234)).toBe(-1.23)
  })
})

describe('route', () => {
  const app = express()
  app.get(
    '/ok',
    route('never', async (_req, res) => res.json({ ok: true })),
  )
  app.get(
    '/boom',
    route('it broke', async () => {
      throw new Error('secret detail')
    }),
  )

  it('passes a successful handler through', async () => {
    await request(app).get('/ok').expect(200, { ok: true })
  })

  it('turns a rejection into a 500 with only the given message', async () => {
    await request(app).get('/boom').expect(500, { error: 'it broke' })
  })
})

describe('categories', () => {
  it('resolves manual category, then merchant map, then Uncategorized', () => {
    expect(resolveCategory('ACME GROCERS', 'Dining')).toBe('Dining')
    expect(resolveCategory('ACME GROCERS', null)).toBe('Groceries')
    expect(resolveCategory('ACME GROCERS', '')).toBe('Groceries')
    expect(resolveCategory('acme grocers', null)).toBe('Uncategorized')
    expect(resolveCategory(null, null)).toBe('Uncategorized')
  })

  it('offers extra categories plus every mapped one, sorted and deduplicated', () => {
    expect(MERCHANT_CATEGORIES).toEqual({ 'ACME GROCERS': 'Groceries' })
    expect(SPENDING_CATEGORIES).toEqual(['Dining', 'Groceries', 'Rent'])
    expect(isSpendingCategory('Rent')).toBe(true)
    expect(isSpendingCategory('Uncategorized')).toBe(false)
  })
})

describe('helper edge cases', () => {
  it('isYearMonth rejects non-strings that stringify like one', () => {
    expect(isYearMonth(['2026-01'])).toBe(false)
  })

  it('monthRange is empty when the start year is after the end year', () => {
    expect(monthRange('2027-01', '2026-03')).toEqual([])
  })
})
