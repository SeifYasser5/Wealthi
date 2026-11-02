import request from 'supertest'
import type {
  AccountResponse,
  AccountSourcesResponse,
  AccountsResponse,
  BankSendersResponse,
  TransferRuleResponse,
  TransferRulesResponse,
} from '@wealthi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../../src/app'
import { prisma } from '../../src/db/client'
import { loadIngestSettings, replaceSettings, seedSettings } from '../../src/db/settings'
import { importFromChatDb } from '../../src/services/importer'
import { config } from '../../src/utils/config'
import type { Minor } from '../../src/utils/money'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { fixtureAccounts, fixtureSettings } from '../fixtures/settings'
import { resetDatabase } from '../setup/reset'

/**
 * The settings tables (accounts with their opening balances, sources, transfer
 * rules, bank senders) through the API, how the first start seeds them, and what
 * an import makes of an edit, over the fixture ledger.
 */

beforeEach(() => resetDatabase())

afterAll(async () => {
  await prisma.$disconnect()
})

const accounts = async () => ((await request(app).get('/api/accounts').expect(200)).body as AccountsResponse).accounts

async function runImport() {
  const chatDb = buildChatDb(LEDGER)
  try {
    return await importFromChatDb(chatDb.path)
  } finally {
    chatDb.cleanup()
  }
}

describe('seeding from config', () => {
  it('fills every table in config order, with the opening balances on the accounts', async () => {
    expect(await accounts()).toEqual(fixtureAccounts)
    expect(fixtureAccounts[0]).toMatchObject({ id: 'checking', openingBalance: 1000 })
    const settings = await loadIngestSettings()
    expect(settings.accountSources).toEqual(config.accountSources)
    expect(settings.bankSenders).toEqual(['Test Bank'])
    expect(settings.transferRules).toHaveLength(3)
  })

  it('stores nothing when every table already has rows', async () => {
    expect(await seedSettings(config)).toBe(0)
  })

  it('leaves a table that has rows alone, and fills one that is empty', async () => {
    await request(app).put('/api/accounts/card').send({ label: 'Renamed', openingBalance: 5 }).expect(200)
    await prisma.bankSender.deleteMany()
    expect(await seedSettings(config)).toBe(1)
    expect((await accounts()).find((a) => a.id === 'card')).toMatchObject({ label: 'Renamed', openingBalance: 5 })
    expect((await loadIngestSettings()).bankSenders).toEqual(['Test Bank'])
  })

  it('labels an account by its id when config gives it no label', async () => {
    await resetDatabase({ settings: false })
    await seedSettings({
      ...config,
      accounts: [{ id: 'bare', label: '', currency: 'EGP' }],
      accountSources: {},
      openingBalances: {},
      transferRules: [],
      bankSenders: [],
    })
    expect(await accounts()).toEqual([{ id: 'bare', label: 'bare', currency: 'EGP', openingBalance: 0 }])
  })

  it('replaces everything with another config’s — the demo’s reset', async () => {
    await replaceSettings({
      ...config,
      accounts: [{ id: 'only', label: 'Only', currency: 'USD' }],
      accountSources: { 'x:1': 'only' },
      openingBalances: { only: 1250 as Minor },
      transferRules: [],
      bankSenders: ['Elsewhere'],
    })
    const settings = await loadIngestSettings()
    expect(settings.accounts).toEqual([{ id: 'only', label: 'Only', currency: 'USD', openingBalance: 1250 }])
    expect(settings.accountSources).toEqual({ 'x:1': 'only' })
    expect(settings.transferRules).toEqual([])
    expect(settings.bankSenders).toEqual(['Elsewhere'])
  })
})

describe('/api/accounts', () => {
  const wallet = { id: 'wallet', label: 'Wallet', currency: 'USD', openingBalance: -20.5 }

  it('adds an account after the others, keeping a negative opening balance', async () => {
    const res = await request(app).post('/api/accounts').send(wallet).expect(201)
    expect((res.body as AccountResponse).account).toEqual(wallet)
    expect((await accounts()).map((a) => a.id)).toEqual(['checking', 'card', 'savings_usd', 'wallet'])
  })

  it('starts the order at the first position when there are no accounts', async () => {
    await prisma.transferRule.deleteMany()
    await prisma.accountSource.deleteMany()
    await prisma.account.deleteMany()
    await request(app).post('/api/accounts').send(wallet).expect(201)
    expect((await prisma.account.findUniqueOrThrow({ where: { id: 'wallet' } })).position).toBe(0)
  })

  it('refuses an id already stored', async () => {
    await request(app)
      .post('/api/accounts')
      .send({ ...wallet, id: 'checking' })
      .expect(409, { error: 'account "checking" already exists' })
  })

  it('changes the label and opening balance, never the id or currency', async () => {
    const res = await request(app)
      .put('/api/accounts/savings_usd')
      .send({ label: 'Dollars', openingBalance: 30, currency: 'EGP' })
      .expect(200)
    expect((res.body as AccountResponse).account).toEqual({
      id: 'savings_usd',
      label: 'Dollars',
      currency: 'USD',
      openingBalance: 30,
    })
    await request(app).put('/api/accounts/nope').send({ label: 'X', openingBalance: 0 }).expect(404)
  })

  it('deletes an account nothing names', async () => {
    await request(app).post('/api/accounts').send(wallet).expect(201)
    await request(app).delete('/api/accounts/wallet').expect(204)
    expect((await accounts()).map((a) => a.id)).not.toContain('wallet')
    await request(app).delete('/api/accounts/wallet').expect(404)
  })

  it('refuses one a source and a transfer rule still name, with the counts', async () => {
    const res = await request(app).delete('/api/accounts/card').expect(409)
    expect(res.body).toEqual({ error: '"card" is used by 1 source and 2 transfer rules; remove them first' })
  })

  it('refuses one the ledger names', async () => {
    await runImport()
    await prisma.accountSource.deleteMany()
    await prisma.transferRule.deleteMany()
    const res = await request(app).delete('/api/accounts/checking').expect(409)
    expect((res.body as { error: string }).error).toMatch(
      /^"checking" is used by \d+ transactions? and \d+ monthly balances?; remove them first$/,
    )
  })

  it('refuses one a CSV import in config names, as its account or its counter account', async () => {
    await request(app).post('/api/accounts').send(wallet).expect(201)
    const csv = (over: object) =>
      ({
        id: 'c',
        file: 'f.csv',
        from: '2026-01',
        account: 'checking',
        columns: { amount: 'A', date: 'D' },
        values: { currency: 'EGP' },
        ...over,
      }) as (typeof config.csvImports)[number]
    config.csvImports.push(csv({ account: 'wallet' }))
    try {
      await request(app)
        .delete('/api/accounts/wallet')
        .expect(409, { error: '"wallet" is used by 1 CSV import; remove them first' })
      config.csvImports.splice(0, config.csvImports.length, csv({ counterAccount: 'wallet' }))
      await request(app).delete('/api/accounts/wallet').expect(409)
    } finally {
      config.csvImports.length = 0
    }
    await request(app).delete('/api/accounts/wallet').expect(204)
  })

  it('refuses one a manual transaction or schedule names', async () => {
    await request(app).post('/api/accounts').send(wallet).expect(201)
    await prisma.manualTransaction.create({
      data: {
        type: 'debit',
        amount: '1.00',
        currency: 'USD',
        account: 'wallet',
        merchant: 'm',
        date: new Date('2026-01-01'),
      },
    })
    await prisma.schedule.create({
      data: {
        type: 'debit',
        amount: '1.00',
        currency: 'USD',
        account: 'wallet',
        merchant: 'm',
        frequency: 'monthly',
        startDate: new Date('2026-01-01'),
      },
    })
    await request(app)
      .delete('/api/accounts/wallet')
      .expect(409, { error: '"wallet" is used by 1 schedule and 1 manual transaction; remove them first' })
  })
})

describe('/api/account-sources', () => {
  const list = async () =>
    ((await request(app).get('/api/account-sources').expect(200)).body as AccountSourcesResponse).accountSources

  it('lists the keys by name', async () => {
    expect((await list()).map((s) => s.source)).toEqual(['test-bank:1111', 'test-bank:2222', 'test-bank:3333'])
  })

  it('maps a new key and moves an existing one', async () => {
    await request(app).put('/api/account-sources').send({ source: 'test-bank:9999', account: 'card' }).expect(200)
    await request(app).put('/api/account-sources').send({ source: 'test-bank:1111', account: 'card' }).expect(200)
    expect(await list()).toEqual([
      { source: 'test-bank:1111', account: 'card' },
      { source: 'test-bank:2222', account: 'card' },
      { source: 'test-bank:3333', account: 'savings_usd' },
      { source: 'test-bank:9999', account: 'card' },
    ])
  })

  it('refuses an account that is not stored', async () => {
    await request(app)
      .put('/api/account-sources')
      .send({ source: 'test-bank:1', account: 'nope' })
      .expect(400, { error: 'account "nope" does not exist' })
  })

  it('removes a key by its URL-encoded name', async () => {
    await request(app)
      .delete(`/api/account-sources/${encodeURIComponent('test-bank:1111')}`)
      .expect(204)
    expect(await list()).toHaveLength(2)
    await request(app).delete('/api/account-sources/test-bank%3A1111').expect(404)
  })
})

describe('/api/transfer-rules', () => {
  const list = async () =>
    ((await request(app).get('/api/transfer-rules').expect(200)).body as TransferRulesResponse).transferRules
  const rule = { account: 'card', type: 'debit', merchant: 'ATM', counterAccount: 'checking' }
  const create = async (body = rule) =>
    ((await request(app).post('/api/transfer-rules').send(body).expect(201)).body as TransferRuleResponse).transferRule

  it('lists a rule with a merchant ahead of the catch-alls, which the seed stored last', async () => {
    expect((await list()).map((r) => [r.account, r.merchant])).toEqual([
      ['checking', 'CARD PAYMENT'],
      ['card', 'CARD PAYMENT'],
      ['savings_usd', ''],
    ])
    // A catch-all stored before a specific rule on the same account still sorts after it.
    await create({ account: 'savings_usd', type: 'credit', merchant: 'WIRE', counterAccount: 'checking' })
    expect((await list()).map((r) => r.merchant)).toEqual(['CARD PAYMENT', 'CARD PAYMENT', 'WIRE', ''])
  })

  it('stores a rule and replaces it', async () => {
    const stored = await create()
    expect(stored).toEqual({ id: expect.any(Number), ...rule })
    const res = await request(app)
      .put(`/api/transfer-rules/${stored.id}`)
      .send({ ...rule, merchant: '' })
      .expect(200)
    expect((res.body as TransferRuleResponse).transferRule).toEqual({ ...stored, merchant: '' })
  })

  it('refuses a second rule for the same account, direction and merchant', async () => {
    await create()
    await request(app)
      .post('/api/transfer-rules')
      .send(rule)
      .expect(409, { error: 'a debit rule for "ATM" on "card" already exists' })
    await request(app)
      .post('/api/transfer-rules')
      .send({ ...rule, account: 'savings_usd', type: 'credit', merchant: '' })
      .expect(409, { error: 'a credit rule for any merchant on "savings_usd" already exists' })
  })

  it('refuses an account that is not stored', async () => {
    await request(app)
      .post('/api/transfer-rules')
      .send({ ...rule, counterAccount: 'nope' })
      .expect(400, { error: 'account "card" or "nope" does not exist' })
  })

  it('is 404 on an unknown id, for a replace and a delete', async () => {
    await request(app).put('/api/transfer-rules/99999').send(rule).expect(404)
    await request(app).delete('/api/transfer-rules/99999').expect(404)
  })

  it('refuses a replace that would collide with another rule', async () => {
    await create()
    const other = await create({ ...rule, merchant: 'POS' })
    await request(app).put(`/api/transfer-rules/${other.id}`).send(rule).expect(409)
  })

  it('deletes a rule', async () => {
    const { id } = await create()
    await request(app).delete(`/api/transfer-rules/${id}`).expect(204)
    expect(await list()).toHaveLength(3)
  })
})

describe('/api/bank-senders', () => {
  const list = async () =>
    ((await request(app).get('/api/bank-senders').expect(200)).body as BankSendersResponse).bankSenders

  it('adds a sender and answers with the list, by name', async () => {
    const res = await request(app).post('/api/bank-senders').send({ sender: '+15550001111' }).expect(201)
    expect((res.body as BankSendersResponse).bankSenders).toEqual(['+15550001111', 'Test Bank'])
    await request(app)
      .post('/api/bank-senders')
      .send({ sender: 'Test Bank' })
      .expect(409, { error: 'sender "Test Bank" already exists' })
  })

  it('removes one by its URL-encoded name', async () => {
    await request(app).post('/api/bank-senders').send({ sender: '+1 555' }).expect(201)
    await request(app)
      .delete(`/api/bank-senders/${encodeURIComponent('+1 555')}`)
      .expect(204)
    expect(await list()).toEqual(['Test Bank'])
    await request(app).delete('/api/bank-senders/nope').expect(404)
  })
})

describe('the import reads the tables', () => {
  const closing = async (account: string, yearMonth: string) =>
    (await prisma.monthlyBalance.findUniqueOrThrow({ where: { yearMonth_account: { yearMonth, account } } }))
      .closingBalance

  it('opens the first month from the account’s opening balance', async () => {
    await runImport()
    const before = (await closing('checking', '2026-02')).toNumber()
    await request(app).put('/api/accounts/checking').send({ label: 'Checking', openingBalance: 2000 }).expect(200)
    await runImport()
    expect((await closing('checking', '2026-02')).toNumber()).toBe(before + 1000)
  })

  it('imports nothing from a sender that was removed', async () => {
    await request(app).delete('/api/bank-senders/Test%20Bank').expect(204)
    expect(await runImport()).toMatchObject({ months: 0, totalStored: 0 })
  })

  it('tags a transfer by the stored rules, and stops when the rule is deleted', async () => {
    const tagged = () => prisma.transaction.count({ where: { counterAccount: { not: null } } })
    await runImport()
    expect(await tagged()).toBeGreaterThan(0)
    await prisma.transferRule.deleteMany()
    await runImport()
    expect(await tagged()).toBe(0)
  })

  it('reports a message on an unmapped source as a parse error', async () => {
    await prisma.accountSource.deleteMany()
    const { errors, totalStored } = await runImport()
    expect(totalStored).toBe(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('has the fixture settings the unit tests assume', async () => {
    expect(await loadIngestSettings()).toEqual(fixtureSettings)
  })
})
