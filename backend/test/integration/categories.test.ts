import request from 'supertest'
import type { CategoriesResponse, CategoryResponse, SpendingResponse } from '@wealthi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../../src/app'
import { replaceCategories, seedCategories } from '../../src/db/categories'
import { prisma } from '../../src/db/client'
import { importFromChatDb } from '../../src/services/importer'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/**
 * The categories and merchant_categories tables through the API, over the
 * imported fixture ledger. resetDatabase() seeds them from the fixture config
 * as a first start would: Dining, Groceries, Rent, and ACME GROCERS → Groceries.
 */

beforeEach(async () => {
  await resetDatabase()
  const chatDb = buildChatDb(LEDGER)
  try {
    await importFromChatDb(chatDb.path)
  } finally {
    chatDb.cleanup()
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

const list = async () => ((await request(app).get('/api/categories').expect(200)).body as CategoriesResponse).categories
const names = async () => (await list()).map((c) => c.name)
const idOf = async (name: string) => (await prisma.category.findUniqueOrThrow({ where: { name } })).id
const spending = async (yearMonth: string) =>
  ((await request(app).get(`/api/spending?yearMonth=${yearMonth}`)).body as SpendingResponse).categories.map(
    (c) => c.category,
  )
const cityCafe = () => prisma.transaction.findFirstOrThrow({ where: { merchant: 'CITY CAFE' } })

describe('the seed', () => {
  it('stores config’s categories alphabetically, with the merchant map', async () => {
    expect(await list()).toEqual([
      {
        id: expect.any(Number),
        name: 'Dining',
        position: 0,
        budget: null,
        transactionCount: 0,
        scheduleCount: 0,
        merchants: [],
      },
      {
        id: expect.any(Number),
        name: 'Groceries',
        position: 1,
        budget: null,
        transactionCount: 0,
        scheduleCount: 0,
        merchants: ['ACME GROCERS'],
      },
      {
        id: expect.any(Number),
        name: 'Rent',
        position: 2,
        budget: null,
        transactionCount: 0,
        scheduleCount: 0,
        merchants: [],
      },
    ])
  })

  it('never overwrites stored categories', async () => {
    await request(app)
      .delete(`/api/categories/${await idOf('Rent')}`)
      .expect(204)
    expect(await seedCategories({ merchantCategories: {}, extraCategories: ['Rent', 'Travel'] })).toBe(0)
    expect(await names()).toEqual(['Dining', 'Groceries'])
  })

  it('collapses names differing in case and skips Uncategorized', async () => {
    await resetDatabase({ categories: false })
    const seeded = await seedCategories({
      merchantCategories: { 'CITY CAFE': 'dining', 'ACME GROCERS': 'Uncategorized' },
      extraCategories: ['Dining', 'uncategorized'],
    })
    expect(seeded).toBe(1)
    expect(await list()).toEqual([expect.objectContaining({ name: 'Dining', merchants: ['CITY CAFE'] })])
  })
})

describe('POST /api/categories', () => {
  it('adds one after the others', async () => {
    const res = await request(app).post('/api/categories').send({ name: ' Travel ' }).expect(201)
    expect((res.body as CategoryResponse).category).toMatchObject({ name: 'Travel', position: 3, transactionCount: 0 })
    expect(await names()).toEqual(['Dining', 'Groceries', 'Rent', 'Travel'])
  })

  it('starts at 0 when there are none', async () => {
    await resetDatabase({ categories: false })
    const res = await request(app).post('/api/categories').send({ name: 'Travel' }).expect(201)
    expect((res.body as CategoryResponse).category.position).toBe(0)
  })

  it.each([
    ['Dining', 'category "Dining" already exists'],
    ['dining', 'category "Dining" already exists'],
    ['uncategorized', '"Uncategorized" is reserved for rows with no category'],
  ])('refuses %s with a 409', async (name, error) => {
    await request(app).post('/api/categories').send({ name }).expect(409, { error })
    expect(await names()).toEqual(['Dining', 'Groceries', 'Rent'])
  })
})

describe('PATCH /api/categories/:id', () => {
  it('renames it, and its merchants and transactions follow', async () => {
    const groceries = await idOf('Groceries')
    await request(app)
      .patch(`/api/transactions/${(await cityCafe()).id}/category`)
      .send({ categoryId: groceries })
      .expect(200)

    const res = await request(app).patch(`/api/categories/${groceries}`).send({ name: 'Food' }).expect(200)
    expect((res.body as CategoryResponse).category).toEqual({
      id: groceries,
      name: 'Food',
      position: 1,
      budget: null,
      transactionCount: 1,
      scheduleCount: 0,
      merchants: ['ACME GROCERS'],
    })
    expect(await spending('2026-02')).toEqual(['Food'])
    const [tx] = (await request(app).get('/api/transactions?merchant=CITY%20CAFE')).body.transactions
    expect(tx).toMatchObject({ categoryId: groceries, category: 'Food' })
  })

  it('may change only the case of its own name', async () => {
    await request(app)
      .patch(`/api/categories/${await idOf('Rent')}`)
      .send({ name: 'RENT' })
      .expect(200)
    expect(await names()).toEqual(['Dining', 'Groceries', 'RENT'])
  })

  it('refuses another category’s name, and 404s an unknown id', async () => {
    await request(app)
      .patch(`/api/categories/${await idOf('Rent')}`)
      .send({ name: 'groceries' })
      .expect(409, { error: 'category "Groceries" already exists' })
    await request(app).patch('/api/categories/999999').send({ name: 'X' }).expect(404, { error: 'category 999999 not found' }) // prettier-ignore
  })
})

describe('DELETE /api/categories/:id', () => {
  it('deletes one nothing uses', async () => {
    await request(app)
      .delete(`/api/categories/${await idOf('Rent')}`)
      .expect(204)
    expect(await names()).toEqual(['Dining', 'Groceries'])
  })

  it('refuses one a merchant maps to, saying so', async () => {
    await request(app)
      .delete(`/api/categories/${await idOf('Groceries')}`)
      .expect(409, { error: '"Groceries" is used by 1 merchant; move them to another category first' })
  })

  it('refuses one assigned to transactions, counting them and the merchants', async () => {
    const groceries = await idOf('Groceries')
    for (const tx of await prisma.transaction.findMany({
      where: { merchant: { in: ['CITY CAFE', 'EMPLOYER LTD'] } },
    })) {
      await request(app).patch(`/api/transactions/${tx.id}/category`).send({ categoryId: groceries }).expect(200)
    }
    await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: 'CITY CAFE', categoryId: groceries })
      .expect(200)
    expect((await list()).find((c) => c.id === groceries)).toMatchObject({ transactionCount: 3, merchants: ['ACME GROCERS', 'CITY CAFE'] }) // prettier-ignore
    await request(app)
      .delete(`/api/categories/${groceries}`)
      .expect(409, { error: '"Groceries" is used by 3 transactions and 2 merchants; move them to another category first' }) // prettier-ignore
  })

  it('refuses one used only by a transaction', async () => {
    const dining = await idOf('Dining')
    await request(app)
      .patch(`/api/transactions/${(await cityCafe()).id}/category`)
      .send({ categoryId: dining })
    await request(app)
      .delete(`/api/categories/${dining}`)
      .expect(409, { error: '"Dining" is used by 1 transaction; move them to another category first' })
  })

  it('404s an unknown id', async () => {
    await request(app).delete('/api/categories/999999').expect(404, { error: 'category 999999 not found' })
  })

  it('refuses one a schedule gives to its occurrences, listing every use', async () => {
    const groceries = await idOf('Groceries')
    await prisma.schedule.create({
      data: { type: 'debit', amount: '10.00', currency: 'EGP', account: 'checking', merchant: 'GYM', categoryId: groceries, frequency: 'monthly', startDate: new Date('2026-01-01') }, // prettier-ignore
    })
    await request(app)
      .patch(`/api/transactions/${(await cityCafe()).id}/category`)
      .send({ categoryId: groceries })
    expect((await list()).find((c) => c.id === groceries)?.scheduleCount).toBe(1)
    await request(app)
      .delete(`/api/categories/${groceries}`)
      .expect(409, { error: '"Groceries" is used by 1 transaction, 1 schedule and 1 merchant; move them to another category first' }) // prettier-ignore
  })

  it('is refused by the database itself, whatever the API checks', async () => {
    const groceries = await idOf('Groceries')
    await expect(prisma.category.delete({ where: { id: groceries } })).rejects.toMatchObject({ code: 'P2003' })
  })
})

describe('PUT /api/categories/:id/budget', () => {
  it('stores the budget, lists it, and clears it with null', async () => {
    const id = await idOf('Dining')
    const res = await request(app).put(`/api/categories/${id}/budget`).send({ budget: 1234.5 }).expect(200)
    expect((res.body as CategoryResponse).category.budget).toBe(1234.5)
    expect((await list()).map((c) => [c.name, c.budget])).toEqual([['Dining', 1234.5], ['Groceries', null], ['Rent', null]]) // prettier-ignore

    await request(app).put(`/api/categories/${id}/budget`).send({ budget: null }).expect(200)
    expect((await list())[0].budget).toBeNull()
  })

  it('is a 404 for a category that is not stored', async () => {
    await request(app)
      .put('/api/categories/999999/budget')
      .send({ budget: 5 })
      .expect(404, { error: 'category 999999 not found' })
  })
})

describe('PUT /api/categories/order', () => {
  it('stores the new order, and every list follows it', async () => {
    const [dining, groceries, rent] = await Promise.all(['Dining', 'Groceries', 'Rent'].map(idOf))
    const res = await request(app)
      .put('/api/categories/order')
      .send({ ids: [rent, dining, groceries] })
      .expect(200)
    expect((res.body as CategoriesResponse).categories.map((c) => [c.name, c.position])).toEqual([
      ['Rent', 0],
      ['Dining', 1],
      ['Groceries', 2],
    ])
    expect(await names()).toEqual(['Rent', 'Dining', 'Groceries'])
  })

  it.each([
    ['leaves one out', (ids: number[]) => ids.slice(1)],
    ['names one that is not stored', (ids: number[]) => [...ids.slice(1), 999_999]],
  ])('refuses a list that %s', async (_, edit) => {
    const ids = (await list()).map((c) => c.id)
    await request(app)
      .put('/api/categories/order')
      .send({ ids: edit(ids) })
      .expect(409, { error: 'ids must list every category exactly once; reload and try again' })
    expect(await names()).toEqual(['Dining', 'Groceries', 'Rent'])
  })
})

describe('PUT /api/merchant-categories', () => {
  it('maps a merchant, moves it, and unmaps it; its transactions follow', async () => {
    expect(await spending('2026-02')).toEqual(['Groceries'])

    const dining = await idOf('Dining')
    let res = await request(app).put('/api/merchant-categories').send({ merchant: 'CITY CAFE', categoryId: dining }).expect(200) // prettier-ignore
    expect((res.body as CategoriesResponse).categories.find((c) => c.id === dining)?.merchants).toEqual(['CITY CAFE'])
    expect(await spending('2026-02')).toEqual(['Groceries', 'Dining'])

    res = await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: 'CITY CAFE', categoryId: await idOf('Groceries') })
      .expect(200)
    expect((res.body as CategoriesResponse).categories.map((c) => c.merchants)).toEqual([
      [],
      ['ACME GROCERS', 'CITY CAFE'],
      [],
    ])

    await request(app).put('/api/merchant-categories').send({ merchant: 'CITY CAFE', categoryId: null }).expect(200)
    expect(await spending('2026-02')).toEqual(['Groceries'])
  })

  it('keys on the exact merchant string', async () => {
    await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: 'city cafe', categoryId: await idOf('Dining') })
      .expect(200)
    expect(await spending('2026-02')).toEqual(['Groceries'])
  })

  it('unmapping a merchant that is not mapped changes nothing', async () => {
    await request(app).put('/api/merchant-categories').send({ merchant: 'NOBODY', categoryId: null }).expect(200)
    expect(await prisma.merchantCategory.count()).toBe(1)
  })

  it('refuses a category that is not stored: the foreign key', async () => {
    await request(app)
      .put('/api/merchant-categories')
      .send({ merchant: 'CITY CAFE', categoryId: 999_999 })
      .expect(400, { error: 'category 999999 does not exist' })
    expect(await prisma.merchantCategory.count()).toBe(1)
  })
})

describe('replaceCategories', () => {
  it('replaces every category and mapping, clearing manual and schedule assignments first', async () => {
    const tx = await cityCafe()
    await request(app)
      .patch(`/api/transactions/${tx.id}/category`)
      .send({ categoryId: await idOf('Dining') })
    const schedule = await prisma.schedule.create({
      data: { type: 'debit', amount: '10.00', currency: 'EGP', account: 'checking', merchant: 'GYM', categoryId: await idOf('Rent'), frequency: 'monthly', startDate: new Date('2026-01-01') }, // prettier-ignore
    })

    await replaceCategories({ merchantCategories: { 'CITY CAFE': 'Coffee' }, extraCategories: [] })
    expect(await list()).toEqual([expect.objectContaining({ name: 'Coffee', merchants: ['CITY CAFE'] })])
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categoryId).toBeNull()
    expect((await prisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } })).categoryId).toBeNull()
  })
})
