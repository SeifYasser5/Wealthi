import { beforeEach, describe, expect, it, vi } from 'vitest'

// Failure paths of the db layer that a healthy Postgres never takes.

const prisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  transaction: { update: vi.fn() },
  merchantCategory: { upsert: vi.fn() },
  schedule: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../src/db/client', () => ({ prisma }))

const { isDbConnected } = await import('../../src/db/health')
const { updateCategory } = await import('../../src/db/transactions')
const { createCategory, deleteCategory, renameCategory, setMerchantCategory } = await import('../../src/db/categories')

const { createSchedule, deleteSchedule, updateSchedule } = await import('../../src/db/schedules')

const failWith = (code: string) => Object.assign(new Error(code), { code })

beforeEach(() => vi.resetAllMocks())

describe('isDbConnected', () => {
  it('is false instead of throwing when the query fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await isDbConnected()).toBe(false)
  })
})

describe('updateCategory', () => {
  it('turns "record not found" (P2025) into a not found refusal', async () => {
    prisma.transaction.update.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }))
    expect(await updateCategory('id', 1)).toEqual({ refused: 'not found', error: 'transaction not found' })
  })

  it('rethrows any other error', async () => {
    const error = Object.assign(new Error('deadlock'), { code: 'P2034' })
    prisma.transaction.update.mockRejectedValue(error)
    await expect(updateCategory('id', 1)).rejects.toBe(error)
  })
})

// A name created, or a category assigned, between the check and the write:
// only two concurrent requests get here, and the constraints answer for them.
describe('category writes racing another request', () => {
  it('a unique violation on create or rename is a duplicate', async () => {
    prisma.$transaction.mockRejectedValue(failWith('P2002'))
    expect(await createCategory('Dining')).toEqual({ refused: 'conflict', error: 'category "Dining" already exists' })
    expect(await renameCategory(1, 'Dining')).toEqual({
      refused: 'conflict',
      error: 'category "Dining" already exists',
    })
  })

  it('a foreign key violation on delete is "in use"', async () => {
    prisma.$transaction.mockRejectedValue(failWith('P2003'))
    expect(await deleteCategory(4)).toEqual({ refused: 'conflict', error: 'category 4 is in use' })
  })

  it('rethrows any other error', async () => {
    const error = failWith('P2034')
    prisma.$transaction.mockRejectedValue(error)
    prisma.merchantCategory.upsert.mockRejectedValue(error)
    await expect(createCategory('Dining')).rejects.toBe(error)
    await expect(renameCategory(1, 'Dining')).rejects.toBe(error)
    await expect(deleteCategory(1)).rejects.toBe(error)
    await expect(setMerchantCategory('CAFE', 1)).rejects.toBe(error)
  })
})

describe('schedule writes', () => {
  const input = {
    type: 'debit' as const,
    amount: 100 as import('../../src/utils/money').Minor,
    currency: 'EGP' as const,
    account: 'checking',
    merchant: 'RENT',
    categoryId: null,
    frequency: 'monthly' as const,
    interval: 1,
    startDate: '2026-01-01',
    endDate: null,
  }

  it('rethrows anything but a refusal', async () => {
    const error = failWith('P2034')
    prisma.schedule.create.mockRejectedValue(error)
    prisma.schedule.update.mockRejectedValue(error)
    prisma.schedule.delete.mockRejectedValue(error)
    await expect(createSchedule(input)).rejects.toBe(error)
    await expect(updateSchedule(1, input)).rejects.toBe(error)
    await expect(deleteSchedule(1)).rejects.toBe(error)
  })
})
