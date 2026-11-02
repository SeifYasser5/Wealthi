import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureAccounts } from '../fixtures/settings'

// /api/manual-transactions with db/manual-transactions mocked: status codes,
// refusals and failing queries. The real thing is integration/manual-transactions.test.ts.

const db = vi.hoisted(() => ({
  listManualTransactions: vi.fn(),
  createManualTransaction: vi.fn(),
  updateManualTransaction: vi.fn(),
  deleteManualTransaction: vi.fn(),
}))
vi.mock('../../src/db/manual-transactions', () => db)

vi.mock('../../src/db/accounts', () => ({ listAccounts: vi.fn() }))

const { default: app } = await import('../../src/app')
const { listAccounts } = await import('../../src/db/accounts')

const boom = () => Promise.reject(new Error('connection refused'))

const body = {
  type: 'debit',
  amount: 50,
  account: 'checking',
  merchant: 'Bank fee',
  categoryId: null,
  date: '2026-01-15',
}
const input = { ...body, amount: 5000, currency: 'EGP' }
const manual = { ...body, id: 1, currency: 'EGP', category: null }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listAccounts).mockResolvedValue(fixtureAccounts)
})

describe('GET /api/manual-transactions', () => {
  it('lists every one', async () => {
    db.listManualTransactions.mockResolvedValue([manual])
    expect((await request(app).get('/api/manual-transactions').expect(200)).body).toEqual({
      manualTransactions: [manual],
    })
  })

  it('keeps only the month asked for', async () => {
    db.listManualTransactions.mockResolvedValue([manual])
    await request(app).get('/api/manual-transactions?yearMonth=2026-01').expect(200)
    expect(db.listManualTransactions).toHaveBeenCalledWith('2026-01')
  })

  it('is 400 on a month that is not YYYY-MM', async () => {
    await request(app)
      .get('/api/manual-transactions?yearMonth=January')
      .expect(400, { error: 'yearMonth must be in YYYY-MM format' })
    expect(db.listManualTransactions).not.toHaveBeenCalled()
  })

  it('is 500 when the query fails', async () => {
    db.listManualTransactions.mockImplementation(boom)
    await request(app).get('/api/manual-transactions').expect(500, { error: 'failed to list manual transactions' })
  })
})

describe('POST /api/manual-transactions', () => {
  it('creates one from the validated body', async () => {
    db.createManualTransaction.mockResolvedValue(manual)
    const res = await request(app).post('/api/manual-transactions').send(body).expect(201)
    expect(res.body).toEqual({ manualTransaction: manual })
    expect(db.createManualTransaction).toHaveBeenCalledWith(input)
  })

  it('is 400 on a bad body, without a write', async () => {
    await request(app)
      .post('/api/manual-transactions')
      .send({ ...body, amount: 0 })
      .expect(400, { error: 'amount must be more than 0' })
    expect(db.createManualTransaction).not.toHaveBeenCalled()
  })

  it('is 400 on a category that is not stored', async () => {
    db.createManualTransaction.mockResolvedValue({ refused: 'invalid', error: 'category 9 does not exist' })
    await request(app)
      .post('/api/manual-transactions')
      .send({ ...body, categoryId: 9 })
      .expect(400, { error: 'category 9 does not exist' })
  })

  it('is 500 when the write fails', async () => {
    db.createManualTransaction.mockImplementation(boom)
    await request(app)
      .post('/api/manual-transactions')
      .send(body)
      .expect(500, { error: 'failed to create manual transaction' })
  })
})

describe('PUT /api/manual-transactions/:id', () => {
  it('replaces one', async () => {
    db.updateManualTransaction.mockResolvedValue(manual)
    const res = await request(app).put('/api/manual-transactions/1').send(body).expect(200)
    expect(res.body).toEqual({ manualTransaction: manual })
    expect(db.updateManualTransaction).toHaveBeenCalledWith(1, input)
  })

  it('is 400 on a bad id or body', async () => {
    await request(app).put('/api/manual-transactions/x').send(body).expect(400)
    await request(app)
      .put('/api/manual-transactions/1')
      .send({ ...body, merchant: '' })
      .expect(400, { error: 'merchant is required' })
    expect(db.updateManualTransaction).not.toHaveBeenCalled()
  })

  it('is 404 on an unknown id', async () => {
    db.updateManualTransaction.mockResolvedValue({ refused: 'not found', error: 'manual transaction 5 not found' })
    await request(app)
      .put('/api/manual-transactions/5')
      .send(body)
      .expect(404, { error: 'manual transaction 5 not found' })
  })

  it('is 500 when the write fails', async () => {
    db.updateManualTransaction.mockImplementation(boom)
    await request(app)
      .put('/api/manual-transactions/1')
      .send(body)
      .expect(500, { error: 'failed to update manual transaction' })
  })
})

describe('DELETE /api/manual-transactions/:id', () => {
  it('is 204 once deleted', async () => {
    db.deleteManualTransaction.mockResolvedValue(null)
    await request(app).delete('/api/manual-transactions/3').expect(204)
    expect(db.deleteManualTransaction).toHaveBeenCalledWith(3)
  })

  it('is 400 on a bad id', async () => {
    await request(app).delete('/api/manual-transactions/0').expect(400)
  })

  it('is 404 on an unknown id', async () => {
    db.deleteManualTransaction.mockResolvedValue({ refused: 'not found', error: 'manual transaction 3 not found' })
    await request(app).delete('/api/manual-transactions/3').expect(404)
  })

  it('is 500 when the write fails', async () => {
    db.deleteManualTransaction.mockImplementation(boom)
    await request(app)
      .delete('/api/manual-transactions/3')
      .expect(500, { error: 'failed to delete manual transaction' })
  })
})
