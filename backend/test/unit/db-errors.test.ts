import { beforeEach, describe, expect, it, vi } from 'vitest'

// Failure paths of the db layer that a healthy Postgres never takes.

const prisma = vi.hoisted(() => ({ $queryRaw: vi.fn(), transaction: { update: vi.fn() } }))
vi.mock('../../src/db/client', () => ({ prisma }))

const { isDbConnected } = await import('../../src/db/health')
const { updateCategory } = await import('../../src/db/transactions')

beforeEach(() => vi.resetAllMocks())

describe('isDbConnected', () => {
  it('is false instead of throwing when the query fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await isDbConnected()).toBe(false)
  })
})

describe('updateCategory', () => {
  it('turns "record not found" (P2025) into null', async () => {
    prisma.transaction.update.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }))
    expect(await updateCategory('id', 'Rent')).toBeNull()
  })

  it('rethrows any other error', async () => {
    const error = Object.assign(new Error('deadlock'), { code: 'P2034' })
    prisma.transaction.update.mockRejectedValue(error)
    await expect(updateCategory('id', 'Rent')).rejects.toBe(error)
  })
})
