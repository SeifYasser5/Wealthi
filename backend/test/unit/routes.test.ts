import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureAccounts } from '../fixtures/settings'

// The HTTP layer with every db module mocked: status codes, error mapping and
// the paths a real database can't easily be pushed into (a failing query, a
// down database). The happy paths against real Postgres live in integration/api.test.ts.

const db = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  queryTransactions: vi.fn(),
  updateCategory: vi.fn(),
  findBalancesByMonth: vi.fn(),
  getSpendingTransactions: vi.fn(),
  getInsightTransactions: vi.fn(),
  isDbConnected: vi.fn(),
  runImport: vi.fn(),
  listPatterns: vi.fn(),
  setPatternStatus: vi.fn(),
  runLearn: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategories: vi.fn(),
  setCategoryBudget: vi.fn(),
  setMerchantCategory: vi.fn(),
  loadMerchantCategories: vi.fn(),
}))
vi.mock('../../src/db/accounts', () => ({ listAccounts: db.listAccounts }))
vi.mock('../../src/db/transactions', () => ({
  queryTransactions: db.queryTransactions,
  updateCategory: db.updateCategory,
}))
vi.mock('../../src/db/balances', () => ({ findBalancesByMonth: db.findBalancesByMonth }))
vi.mock('../../src/db/spending', () => ({ getSpendingTransactions: db.getSpendingTransactions }))
vi.mock('../../src/db/insights', () => ({ getInsightTransactions: db.getInsightTransactions }))
vi.mock('../../src/db/health', () => ({ isDbConnected: db.isDbConnected }))
vi.mock('../../src/services/run-import', () => ({ runImport: db.runImport }))
vi.mock('../../src/db/patterns', () => ({ listPatterns: db.listPatterns, setPatternStatus: db.setPatternStatus }))
vi.mock('../../src/services/run-learn', () => ({ runLearn: db.runLearn }))
vi.mock('../../src/db/categories', () => ({
  listCategories: db.listCategories,
  createCategory: db.createCategory,
  renameCategory: db.renameCategory,
  deleteCategory: db.deleteCategory,
  reorderCategories: db.reorderCategories,
  setCategoryBudget: db.setCategoryBudget,
  setMerchantCategory: db.setMerchantCategory,
  loadMerchantCategories: db.loadMerchantCategories,
}))

const { default: app } = await import('../../src/app')

const ID = '0b6c7d2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const boom = () => Promise.reject(new Error('connection refused'))

beforeEach(() => {
  vi.resetAllMocks()
  db.listAccounts.mockResolvedValue(fixtureAccounts)
})

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

describe('GET /api/accounts', () => {
  it('lists the stored accounts', async () => {
    const res = await request(app).get('/api/accounts').expect(200)
    expect(res.body).toEqual({ accounts: fixtureAccounts })
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
    ['/api/insights', 'failed to load insights', () => db.getInsightTransactions.mockImplementation(boom)],
  ])('GET %s', async (path, error, arrange) => {
    arrange()
    await request(app).get(path).expect(500, { error })
  })

  it('PATCH category', async () => {
    db.updateCategory.mockImplementation(boom)
    await request(app)
      .patch(`/api/transactions/${ID}/category`)
      .send({ categoryId: 1 })
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
      .send({ categoryId: 1 })
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

  it.each([
    ['not found', 404],
    ['invalid', 400],
  ] as const)('PATCH answers a %s refusal with a %i', async (refused, status) => {
    db.updateCategory.mockResolvedValue({ refused, error: 'nope' })
    await request(app).patch(`/api/transactions/${ID}/category`).send({ categoryId: null }).expect(status, { error: 'nope' }) // prettier-ignore
    expect(db.updateCategory).toHaveBeenCalledWith(ID, null)
  })
})

describe('POST /api/import', () => {
  it('responds with the import report once it has finished', async () => {
    const report = {
      status: 'completed',
      source: '/data/chat.db',
      finishedAt: '2026-01-05T09:30:00.000Z',
      durationMs: 12,
      months: 2,
      totalStored: 7,
      parseErrors: [],
    }
    db.runImport.mockResolvedValue(report)
    await request(app).post('/api/import').expect(200, report)
  })

  it('is a 500 carrying the reason when the import fails', async () => {
    db.runImport.mockRejectedValue(new Error('connection refused'))
    await request(app).post('/api/import').expect(500, { error: 'import failed: connection refused' })
  })

  it('reports a non-Error failure as-is', async () => {
    db.runImport.mockRejectedValue('weird')
    await request(app).post('/api/import').expect(500, { error: 'import failed: weird' })
  })

  it('only answers POST', async () => {
    await request(app).get('/api/import').expect(404)
    expect(db.runImport).not.toHaveBeenCalled()
  })
})

const PATTERN = {
  id: 'test-bank:abc',
  bank: 'test-bank',
  status: 'enabled',
  type: 'debit',
  pattern: 'Paid {amount:NUM}',
  reason: 'r',
  review: [],
  messages: 3,
  missing: false,
  learnedAt: '2026-01-05T09:30:00.000Z',
}

describe('/api/patterns', () => {
  it('GET lists every pattern', async () => {
    db.listPatterns.mockResolvedValue([PATTERN])
    await request(app)
      .get('/api/patterns')
      .expect(200, { patterns: [PATTERN] })
  })

  it('POST /learn responds with the learn report once it has finished', async () => {
    const report = { status: 'completed', source: '/data/chat.db', finishedAt: '2026-01-05T09:30:00.000Z', durationMs: 5, messages: 9, undecodable: 0, added: 2 } // prettier-ignore
    db.runLearn.mockResolvedValue(report)
    await request(app).post('/api/patterns/learn').expect(200, report)
  })

  it.each([
    [new Error('connection refused'), 'learn failed: connection refused'],
    ['weird', 'learn failed: weird'],
  ])('POST /learn is a 500 carrying the reason when it fails (%s)', async (reason, error) => {
    db.runLearn.mockRejectedValue(reason)
    await request(app).post('/api/patterns/learn').expect(500, { error })
  })

  it('PATCH sets the statuses and responds with every pattern', async () => {
    db.setPatternStatus.mockResolvedValue([])
    db.listPatterns.mockResolvedValue([PATTERN])
    await request(app)
      .patch('/api/patterns')
      .send({ enable: ['test-bank:abc'] })
      .expect(200, { patterns: [PATTERN] })
    expect(db.setPatternStatus).toHaveBeenCalledWith(['test-bank:abc'], [])
  })

  it('PATCH 404s unknown ids, naming them', async () => {
    db.setPatternStatus.mockResolvedValue(['x:1', 'x:2'])
    await request(app)
      .patch('/api/patterns')
      .send({ disable: ['x:1', 'x:2'] })
      .expect(404, { error: 'unknown pattern ids: x:1, x:2' })
    expect(db.listPatterns).not.toHaveBeenCalled()
  })

  it('PATCH validates before the database', async () => {
    await request(app)
      .patch('/api/patterns')
      .send({})
      .expect(400, { error: 'name at least one pattern to enable or disable' })
    expect(db.setPatternStatus).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', () => db.listPatterns.mockImplementation(boom), 'failed to list patterns'],
    ['PATCH', () => db.setPatternStatus.mockImplementation(boom), 'failed to update patterns'],
  ] as const)('%s failures become a 500 with a fixed message', async (method, arrange, error) => {
    arrange()
    const req = method === 'GET' ? request(app).get('/api/patterns') : request(app).patch('/api/patterns').send({ enable: ['a'] }) // prettier-ignore
    await req.expect(500, { error })
  })
})

const CATEGORY = {
  id: 2,
  name: 'Dining',
  position: 0,
  budget: null,
  transactionCount: 1,
  scheduleCount: 0,
  merchants: ['CITY CAFE'],
}
const LISTED = { categories: [CATEGORY], uncategorized: 'Uncategorized' }

describe('/api/categories', () => {
  it('GET lists every category and the uncategorized label', async () => {
    db.listCategories.mockResolvedValue([CATEGORY])
    await request(app).get('/api/categories').expect(200, LISTED)
  })

  it('POST creates one, 201, with the trimmed name', async () => {
    db.createCategory.mockResolvedValue(CATEGORY)
    await request(app).post('/api/categories').send({ name: ' Dining ' }).expect(201, { category: CATEGORY })
    expect(db.createCategory).toHaveBeenCalledWith('Dining')
  })

  it('PATCH renames one', async () => {
    db.renameCategory.mockResolvedValue(CATEGORY)
    await request(app).patch('/api/categories/2').send({ name: 'Dining' }).expect(200, { category: CATEGORY })
    expect(db.renameCategory).toHaveBeenCalledWith(2, 'Dining')
  })

  it('DELETE is a 204', async () => {
    db.deleteCategory.mockResolvedValue(null)
    await request(app).delete('/api/categories/2').expect(204)
    expect(db.deleteCategory).toHaveBeenCalledWith(2)
  })

  it('PUT /:id/budget sets a budget in minor units, or clears it', async () => {
    db.setCategoryBudget.mockResolvedValue(CATEGORY)
    await request(app).put('/api/categories/2/budget').send({ budget: 12.5 }).expect(200, { category: CATEGORY })
    expect(db.setCategoryBudget).toHaveBeenCalledWith(2, 1250)
    await request(app).put('/api/categories/2/budget').send({ budget: null }).expect(200)
    expect(db.setCategoryBudget).toHaveBeenLastCalledWith(2, null)
  })

  it.each([
    ['/api/categories/x/budget', { budget: 1 }],
    ['/api/categories/2/budget', { budget: -1 }],
    ['/api/categories/2/budget', { budget: '5' }],
    ['/api/categories/2/budget', { budget: 1.234 }],
    ['/api/categories/2/budget', {}],
  ])('PUT %s %j is a 400', async (path, body) => {
    await request(app).put(path).send(body).expect(400)
  })

  it('PUT /order reorders and responds with every category', async () => {
    db.reorderCategories.mockResolvedValue(null)
    db.listCategories.mockResolvedValue([CATEGORY])
    await request(app)
      .put('/api/categories/order')
      .send({ ids: [2] })
      .expect(200, LISTED)
    expect(db.reorderCategories).toHaveBeenCalledWith([2])
  })

  it.each([
    ['POST', () => request(app).post('/api/categories').send({ name: 'Dining' }), () => db.createCategory],
    ['PATCH', () => request(app).patch('/api/categories/2').send({ name: 'Dining' }), () => db.renameCategory],
    ['DELETE', () => request(app).delete('/api/categories/2'), () => db.deleteCategory],
    ['PUT /budget', () => request(app).put('/api/categories/2/budget').send({ budget: 5 }), () => db.setCategoryBudget],
    [
      'PUT /order',
      () =>
        request(app)
          .put('/api/categories/order')
          .send({ ids: [2] }),
      () => db.reorderCategories,
    ],
  ])('%s answers a refusal with its status and message', async (_, send, fn) => {
    fn().mockResolvedValue({ refused: 'conflict', error: 'in use' })
    await send().expect(409, { error: 'in use' })
    expect(db.listCategories).not.toHaveBeenCalled()
  })

  it.each([
    ['POST', () => request(app).post('/api/categories').send({ name: '  ' }), 'name is required'],
    ['PATCH a bad id', () => request(app).patch('/api/categories/x').send({ name: 'A' }), 'id must be a category id (a positive integer)'], // prettier-ignore
    ['PATCH a bad name', () => request(app).patch('/api/categories/2').send({ name: 5 }), 'name must be a string'],
    ['DELETE', () => request(app).delete('/api/categories/0'), 'id must be a category id (a positive integer)'],
    [
      'PUT /order',
      () =>
        request(app)
          .put('/api/categories/order')
          .send({ ids: [2, 2] }),
      'ids must not repeat',
    ],
  ])('%s validates before the database', async (_, send, error) => {
    await send().expect(400, { error })
    for (const fn of [db.createCategory, db.renameCategory, db.deleteCategory, db.reorderCategories]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['GET', () => request(app).get('/api/categories'), () => db.listCategories, 'failed to list categories'],
    ['POST', () => request(app).post('/api/categories').send({ name: 'A' }), () => db.createCategory, 'failed to create category'], // prettier-ignore
    ['PATCH', () => request(app).patch('/api/categories/2').send({ name: 'A' }), () => db.renameCategory, 'failed to rename category'], // prettier-ignore
    ['DELETE', () => request(app).delete('/api/categories/2'), () => db.deleteCategory, 'failed to delete category'],
    ['PUT /order', () => request(app).put('/api/categories/order').send({ ids: [2] }), () => db.reorderCategories, 'failed to reorder categories'], // prettier-ignore
  ])('%s failures become a 500 with a fixed message', async (_, send, fn, error) => {
    fn().mockImplementation(boom)
    await send().expect(500, { error })
  })
})

describe('PUT /api/merchant-categories', () => {
  it('maps a merchant, exactly as sent, and responds with every category', async () => {
    db.setMerchantCategory.mockResolvedValue(null)
    db.listCategories.mockResolvedValue([CATEGORY])
    await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: ' CITY CAFE', categoryId: 2 })
      .expect(200, LISTED)
    expect(db.setMerchantCategory).toHaveBeenCalledWith(' CITY CAFE', 2)
  })

  it('answers a refusal with its status', async () => {
    db.setMerchantCategory.mockResolvedValue({ refused: 'invalid', error: 'category 9 does not exist' })
    await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: 'CITY CAFE', categoryId: 9 })
      .expect(400, { error: 'category 9 does not exist' })
  })

  it('validates before the database', async () => {
    await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: '', categoryId: null })
      .expect(400, { error: 'merchant is required' })
    expect(db.setMerchantCategory).not.toHaveBeenCalled()
  })

  it('is a 500 with a fixed message when the database fails', async () => {
    db.setMerchantCategory.mockImplementation(boom)
    await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: 'CITY CAFE', categoryId: null })
      .expect(500, { error: 'failed to update merchant category' })
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
