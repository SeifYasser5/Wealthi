import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The HTTP layer with every db module mocked: status codes, error mapping and
// the paths a real database can't easily be pushed into (a failing query, a
// down database). The happy paths against real Postgres live in integration/api.test.ts.

const db = vi.hoisted(() => ({
  queryTransactions: vi.fn(),
  updateCategory: vi.fn(),
  findBalancesByMonth: vi.fn(),
  getSpendingTransactions: vi.fn(),
  isDbConnected: vi.fn(),
}))
vi.mock('../../src/db/transactions', () => ({
  queryTransactions: db.queryTransactions,
  updateCategory: db.updateCategory,
}))
vi.mock('../../src/db/balances', () => ({ findBalancesByMonth: db.findBalancesByMonth }))
vi.mock('../../src/db/spending', () => ({ getSpendingTransactions: db.getSpendingTransactions }))
vi.mock('../../src/db/health', () => ({ isDbConnected: db.isDbConnected }))

const { default: app } = await import('../../src/app')

const ID = '0b6c7d2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const boom = () => Promise.reject(new Error('connection refused'))

beforeEach(() => vi.resetAllMocks())

describe('GET /api/health', () => {
  it('reports a connected database', async () => {
    db.isDbConnected.mockResolvedValue(true)
    const res = await request(app).get('/api/health').expect(200)
    expect(res.body).toMatchObject({ status: 'ok', db: 'connected' })
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date')
  })

  it('is 503 when the database is down', async () => {
    db.isDbConnected.mockResolvedValue(false)
    const res = await request(app).get('/api/health').expect(503)
    expect(res.body).toMatchObject({ status: 'ok', db: 'disconnected' })
  })
})

describe('config-backed routes', () => {
  it('GET /api/accounts lists the configured accounts', async () => {
    const res = await request(app).get('/api/accounts').expect(200)
    expect(res.body).toEqual({
      accounts: [
        { id: 'checking', label: 'Checking', currency: 'EGP' },
        { id: 'card', label: 'Credit Card', currency: 'EGP' },
        { id: 'savings_usd', label: 'Savings (USD)', currency: 'USD' },
      ],
    })
  })

  it('GET /api/categories returns the vocabulary and the uncategorized label', async () => {
    await request(app)
      .get('/api/categories')
      .expect(200, { categories: ['Dining', 'Groceries', 'Rent'], uncategorized: 'Uncategorized' })
  })
})

describe('failures become a 500 with a fixed message', () => {
  it.each([
    ['/api/transactions', 'failed to query transactions', () => db.queryTransactions.mockImplementation(boom)],
    [
      '/api/balances?yearMonth=2026-01',
      'failed to query balances',
      () => db.findBalancesByMonth.mockImplementation(boom),
    ],
    [
      '/api/spending?yearMonth=2026-01',
      'failed to compute spending breakdown',
      () => db.getSpendingTransactions.mockImplementation(boom),
    ],
  ])('GET %s', async (path, error, arrange) => {
    arrange()
    await request(app).get(path).expect(500, { error })
  })

  it('PATCH category', async () => {
    db.updateCategory.mockImplementation(boom)
    await request(app)
      .patch(`/api/transactions/${ID}/category`)
      .send({ category: 'Rent' })
      .expect(500, { error: 'failed to update transaction category' })
  })
})

describe('validation happens before the database', () => {
  it.each([
    ['/api/transactions?type=nope', 'type must be one of: debit, credit'],
    ['/api/balances', 'yearMonth query param is required and must be in YYYY-MM format'],
    ['/api/spending?yearMonth=2026', 'yearMonth is required in YYYY-MM format'],
  ])('GET %s is a 400', async (path, error) => {
    await request(app).get(path).expect(400, { error })
    expect(db.queryTransactions).not.toHaveBeenCalled()
    expect(db.findBalancesByMonth).not.toHaveBeenCalled()
    expect(db.getSpendingTransactions).not.toHaveBeenCalled()
  })

  it('PATCH with a bad id is a 400', async () => {
    await request(app)
      .patch('/api/transactions/abc/category')
      .send({ category: 'Rent' })
      .expect(400, { error: 'id must be a UUID' })
    expect(db.updateCategory).not.toHaveBeenCalled()
  })

  it('passes validated filters through', async () => {
    db.queryTransactions.mockResolvedValue([])
    await request(app)
      .get('/api/transactions?account=card&merchant=acme&junk=1')
      .expect(200, { count: 0, transactions: [] })
    expect(db.queryTransactions).toHaveBeenCalledWith({ account: 'card', merchant: 'acme' })
  })

  it('PATCH clears with an empty string and 404s an unknown id', async () => {
    db.updateCategory.mockResolvedValue(null)
    await request(app).patch(`/api/transactions/${ID}/category`).send({ category: ' ' }).expect(404)
    expect(db.updateCategory).toHaveBeenCalledWith(ID, null)
  })
})

describe('CORS', () => {
  it('allows the Vite dev origins and nobody else', async () => {
    db.isDbConnected.mockResolvedValue(true)
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example')
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('reads the allowlist from CORS_ORIGINS', async () => {
    vi.resetModules()
    vi.stubEnv('CORS_ORIGINS', ' https://a.example , ,https://b.example')
    const { default: custom } = await import('../../src/app')
    vi.unstubAllEnvs()
    db.isDbConnected.mockResolvedValue(true)
    const res = await request(custom).get('/api/health').set('Origin', 'https://b.example')
    expect(res.headers['access-control-allow-origin']).toBe('https://b.example')
    const dev = await request(custom).get('/api/health').set('Origin', 'http://localhost:5173')
    expect(dev.headers['access-control-allow-origin']).toBeUndefined()
  })
})
