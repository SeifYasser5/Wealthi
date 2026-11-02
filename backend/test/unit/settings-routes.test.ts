import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureAccounts } from '../fixtures/settings'

// /api/accounts (writes), /api/account-sources, /api/transfer-rules and /api/bank-senders
// with their db modules mocked: status codes, refusals and failing queries. The real
// thing against Postgres is integration/settings.test.ts.

const db = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  listAccountSources: vi.fn(),
  setAccountSource: vi.fn(),
  deleteAccountSource: vi.fn(),
  listTransferRules: vi.fn(),
  createTransferRule: vi.fn(),
  updateTransferRule: vi.fn(),
  deleteTransferRule: vi.fn(),
  listBankSenders: vi.fn(),
  addBankSender: vi.fn(),
  deleteBankSender: vi.fn(),
}))
vi.mock('../../src/db/accounts', () => db)
vi.mock('../../src/db/transfer-rules', () => db)
vi.mock('../../src/db/bank-senders', () => db)

const { default: app } = await import('../../src/app')

const boom = () => Promise.reject(new Error('connection refused'))
const conflict = { refused: 'conflict', error: 'nope' }

beforeEach(() => vi.resetAllMocks())

const newAccount = { id: 'wallet', label: 'Wallet', currency: 'EGP', openingBalance: 10 }
const wallet = { ...newAccount }

describe('/api/accounts', () => {
  it('lists, and fails with a fixed message', async () => {
    db.listAccounts.mockResolvedValue(fixtureAccounts)
    expect((await request(app).get('/api/accounts').expect(200)).body).toEqual({ accounts: fixtureAccounts })
    db.listAccounts.mockImplementation(boom)
    await request(app).get('/api/accounts').expect(500, { error: 'failed to list accounts' })
  })

  it('creates from the validated body, answering 400 on a bad one and mapping a refusal', async () => {
    db.createAccount.mockResolvedValue(wallet)
    const res = await request(app).post('/api/accounts').send(newAccount).expect(201)
    expect(res.body).toEqual({ account: wallet })
    expect(db.createAccount).toHaveBeenCalledWith({ ...newAccount, openingBalance: 1000 })

    await request(app)
      .post('/api/accounts')
      .send({ ...newAccount, id: 'a b' })
      .expect(400)
    db.createAccount.mockResolvedValue(conflict)
    await request(app).post('/api/accounts').send(newAccount).expect(409, { error: 'nope' })
    db.createAccount.mockImplementation(boom)
    await request(app).post('/api/accounts').send(newAccount).expect(500, { error: 'failed to create account' })
  })

  it('updates the label and opening balance', async () => {
    db.updateAccount.mockResolvedValue(wallet)
    const res = await request(app).put('/api/accounts/wallet').send({ label: 'Wallet', openingBalance: 10 }).expect(200)
    expect(res.body).toEqual({ account: wallet })
    expect(db.updateAccount).toHaveBeenCalledWith('wallet', { label: 'Wallet', openingBalance: 1000 })

    await request(app).put('/api/accounts/wallet').send({ label: '' }).expect(400)
    db.updateAccount.mockResolvedValue({ refused: 'not found', error: 'account "x" not found' })
    await request(app).put('/api/accounts/x').send({ label: 'X', openingBalance: 0 }).expect(404)
    db.updateAccount.mockImplementation(boom)
    await request(app)
      .put('/api/accounts/wallet')
      .send({ label: 'W', openingBalance: 0 })
      .expect(500, { error: 'failed to update account' })
  })

  it('deletes, refusing an account that is in use', async () => {
    db.deleteAccount.mockResolvedValue(null)
    await request(app).delete('/api/accounts/wallet').expect(204)
    expect(db.deleteAccount).toHaveBeenCalledWith('wallet')
    db.deleteAccount.mockResolvedValue({ refused: 'conflict', error: '"wallet" is used by 2 transactions' })
    await request(app).delete('/api/accounts/wallet').expect(409, { error: '"wallet" is used by 2 transactions' })
    db.deleteAccount.mockImplementation(boom)
    await request(app).delete('/api/accounts/wallet').expect(500, { error: 'failed to delete account' })
  })
})

describe('/api/account-sources', () => {
  const mapping = { source: 'bank:1234', account: 'checking' }

  it('lists, and fails with a fixed message', async () => {
    db.listAccountSources.mockResolvedValue([mapping])
    expect((await request(app).get('/api/account-sources').expect(200)).body).toEqual({ accountSources: [mapping] })
    db.listAccountSources.mockImplementation(boom)
    await request(app).get('/api/account-sources').expect(500, { error: 'failed to list account sources' })
  })

  it('maps a source, refusing an account that is not stored', async () => {
    db.setAccountSource.mockResolvedValue(mapping)
    expect((await request(app).put('/api/account-sources').send(mapping).expect(200)).body).toEqual({
      accountSource: mapping,
    })
    expect(db.setAccountSource).toHaveBeenCalledWith('bank:1234', 'checking')

    await request(app).put('/api/account-sources').send({ source: '' }).expect(400, { error: 'source is required' })
    db.setAccountSource.mockResolvedValue({ refused: 'invalid', error: 'account "x" does not exist' })
    await request(app).put('/api/account-sources').send(mapping).expect(400, { error: 'account "x" does not exist' })
    db.setAccountSource.mockImplementation(boom)
    await request(app).put('/api/account-sources').send(mapping).expect(500, { error: 'failed to save account source' })
  })

  it('removes a source by its URL-encoded key', async () => {
    db.deleteAccountSource.mockResolvedValue(null)
    await request(app)
      .delete(`/api/account-sources/${encodeURIComponent('bank:1234')}`)
      .expect(204)
    expect(db.deleteAccountSource).toHaveBeenCalledWith('bank:1234')

    db.deleteAccountSource.mockResolvedValue({ refused: 'not found', error: 'source "x" not found' })
    await request(app).delete('/api/account-sources/x').expect(404)
    db.deleteAccountSource.mockImplementation(boom)
    await request(app).delete('/api/account-sources/x').expect(500, { error: 'failed to delete account source' })
  })

  it('is 400 on a blank key', async () => {
    await request(app).delete('/api/account-sources/%20').expect(400, { error: 'source is required' })
  })
})

describe('/api/transfer-rules', () => {
  const body = { account: 'checking', type: 'debit', merchant: 'CARD PAYMENT', counterAccount: 'card' }
  const rule = { id: 1, ...body }

  it('lists, and fails with a fixed message', async () => {
    db.listTransferRules.mockResolvedValue([rule])
    expect((await request(app).get('/api/transfer-rules').expect(200)).body).toEqual({ transferRules: [rule] })
    db.listTransferRules.mockImplementation(boom)
    await request(app).get('/api/transfer-rules').expect(500, { error: 'failed to list transfer rules' })
  })

  it('creates from the validated body', async () => {
    db.createTransferRule.mockResolvedValue(rule)
    expect((await request(app).post('/api/transfer-rules').send(body).expect(201)).body).toEqual({ transferRule: rule })
    expect(db.createTransferRule).toHaveBeenCalledWith(body)

    await request(app)
      .post('/api/transfer-rules')
      .send({ ...body, counterAccount: 'checking' })
      .expect(400, { error: 'counterAccount must differ from account' })
    db.createTransferRule.mockResolvedValue(conflict)
    await request(app).post('/api/transfer-rules').send(body).expect(409)
    db.createTransferRule.mockImplementation(boom)
    await request(app).post('/api/transfer-rules').send(body).expect(500, { error: 'failed to create transfer rule' })
  })

  it('replaces one', async () => {
    db.updateTransferRule.mockResolvedValue(rule)
    expect((await request(app).put('/api/transfer-rules/1').send(body).expect(200)).body).toEqual({
      transferRule: rule,
    })
    expect(db.updateTransferRule).toHaveBeenCalledWith(1, body)

    await request(app).put('/api/transfer-rules/x').send(body).expect(400)
    await request(app)
      .put('/api/transfer-rules/1')
      .send({ ...body, type: 'nope' })
      .expect(400)
    db.updateTransferRule.mockResolvedValue({ refused: 'not found', error: 'transfer rule 5 not found' })
    await request(app).put('/api/transfer-rules/5').send(body).expect(404)
    db.updateTransferRule.mockImplementation(boom)
    await request(app).put('/api/transfer-rules/1').send(body).expect(500, { error: 'failed to update transfer rule' })
  })

  it('deletes one', async () => {
    db.deleteTransferRule.mockResolvedValue(null)
    await request(app).delete('/api/transfer-rules/3').expect(204)
    expect(db.deleteTransferRule).toHaveBeenCalledWith(3)

    await request(app).delete('/api/transfer-rules/0').expect(400)
    db.deleteTransferRule.mockResolvedValue({ refused: 'not found', error: 'transfer rule 3 not found' })
    await request(app).delete('/api/transfer-rules/3').expect(404)
    db.deleteTransferRule.mockImplementation(boom)
    await request(app).delete('/api/transfer-rules/3').expect(500, { error: 'failed to delete transfer rule' })
  })
})

describe('/api/bank-senders', () => {
  it('lists, and fails with a fixed message', async () => {
    db.listBankSenders.mockResolvedValue(['Test Bank'])
    expect((await request(app).get('/api/bank-senders').expect(200)).body).toEqual({ bankSenders: ['Test Bank'] })
    db.listBankSenders.mockImplementation(boom)
    await request(app).get('/api/bank-senders').expect(500, { error: 'failed to list bank senders' })
  })

  it('adds a sender and answers with the full list', async () => {
    db.addBankSender.mockResolvedValue(null)
    db.listBankSenders.mockResolvedValue(['A', 'B'])
    expect((await request(app).post('/api/bank-senders').send({ sender: ' B ' }).expect(201)).body).toEqual({
      bankSenders: ['A', 'B'],
    })
    expect(db.addBankSender).toHaveBeenCalledWith('B')

    await request(app).post('/api/bank-senders').send({ sender: '' }).expect(400, { error: 'sender is required' })
    db.addBankSender.mockResolvedValue(conflict)
    await request(app).post('/api/bank-senders').send({ sender: 'B' }).expect(409)
    db.addBankSender.mockImplementation(boom)
    await request(app)
      .post('/api/bank-senders')
      .send({ sender: 'B' })
      .expect(500, { error: 'failed to add bank sender' })
  })

  it('removes a sender by its URL-encoded name', async () => {
    db.deleteBankSender.mockResolvedValue(null)
    await request(app)
      .delete(`/api/bank-senders/${encodeURIComponent('+1555 000')}`)
      .expect(204)
    expect(db.deleteBankSender).toHaveBeenCalledWith('+1555 000')

    db.deleteBankSender.mockResolvedValue({ refused: 'not found', error: 'sender "x" not found' })
    await request(app).delete('/api/bank-senders/x').expect(404)
    db.deleteBankSender.mockImplementation(boom)
    await request(app).delete('/api/bank-senders/x').expect(500, { error: 'failed to delete bank sender' })
  })

  it('is 400 on a name too long to be one', async () => {
    await request(app)
      .delete(`/api/bank-senders/${'x'.repeat(101)}`)
      .expect(400, { error: 'sender must be at most 100 characters' })
    expect(db.deleteBankSender).not.toHaveBeenCalled()
  })
})
