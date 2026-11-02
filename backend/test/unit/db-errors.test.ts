import { beforeEach, describe, expect, it, vi } from 'vitest'

// Failure paths of the db layer that a healthy Postgres never takes.

const prisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  transaction: { update: vi.fn() },
  merchantCategory: { upsert: vi.fn() },
  account: { update: vi.fn() },
  accountSource: { upsert: vi.fn() },
  transferRule: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  schedule: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../src/db/client', () => ({ prisma }))

const { isDbConnected } = await import('../../src/db/health')
const { updateCategory } = await import('../../src/db/transactions')
const { createCategory, deleteCategory, renameCategory, setMerchantCategory } = await import('../../src/db/categories')

const { createSchedule, deleteSchedule, updateSchedule } = await import('../../src/db/schedules')
const { createAccount, deleteAccount, setAccountSource, updateAccount } = await import('../../src/db/accounts')
const { createTransferRule, deleteTransferRule, updateTransferRule } = await import('../../src/db/transfer-rules')

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

// Writes racing another request, or failing for a reason that is not the caller's.
describe('account writes', () => {
  const account = { id: 'wallet', label: 'Wallet', currency: 'EGP' as const, openingBalance: 0 as import('../../src/utils/money').Minor } // prettier-ignore

  it('a unique violation on create is a duplicate', async () => {
    prisma.$transaction.mockRejectedValue(failWith('P2002'))
    expect(await createAccount(account)).toEqual({ refused: 'conflict', error: 'account "wallet" already exists' })
  })

  it('"record not found" on update is a not found refusal', async () => {
    prisma.account.update.mockRejectedValue(failWith('P2025'))
    expect(await updateAccount('wallet', account)).toEqual({
      refused: 'not found',
      error: 'account "wallet" not found',
    })
  })

  it('a foreign key violation on delete is "in use"', async () => {
    prisma.$transaction.mockRejectedValue(failWith('P2003'))
    expect(await deleteAccount('wallet')).toEqual({ refused: 'conflict', error: 'account "wallet" is in use' })
  })

  it('a foreign key violation on a source is an account that does not exist', async () => {
    prisma.accountSource.upsert.mockRejectedValue(failWith('P2003'))
    expect(await setAccountSource('x:1', 'gone')).toEqual({
      refused: 'invalid',
      error: 'account "gone" does not exist',
    })
  })

  it('rethrows any other error', async () => {
    const error = failWith('P2034')
    prisma.$transaction.mockRejectedValue(error)
    prisma.account.update.mockRejectedValue(error)
    prisma.accountSource.upsert.mockRejectedValue(error)
    await expect(createAccount(account)).rejects.toBe(error)
    await expect(updateAccount('wallet', account)).rejects.toBe(error)
    await expect(deleteAccount('wallet')).rejects.toBe(error)
    await expect(setAccountSource('x:1', 'wallet')).rejects.toBe(error)
  })
})

describe('transfer rule writes', () => {
  const rule = { account: 'a', type: 'debit' as const, merchant: '', counterAccount: 'b' }

  it('a unique violation is a duplicate, whether it is created or replaced', async () => {
    prisma.transferRule.create.mockRejectedValue(failWith('P2002'))
    prisma.transferRule.update.mockRejectedValue(failWith('P2002'))
    const refusal = { refused: 'conflict', error: 'a debit rule for any merchant on "a" already exists' }
    expect(await createTransferRule(rule)).toEqual(refusal)
    expect(await updateTransferRule(1, rule)).toEqual(refusal)
  })

  it('"record not found" is a not found refusal, for a replace and a delete', async () => {
    prisma.transferRule.update.mockRejectedValue(failWith('P2025'))
    prisma.transferRule.delete.mockRejectedValue(failWith('P2025'))
    const refusal = { refused: 'not found', error: 'transfer rule 1 not found' }
    expect(await updateTransferRule(1, rule)).toEqual(refusal)
    expect(await deleteTransferRule(1)).toEqual(refusal)
  })

  it('rethrows any other error', async () => {
    const error = failWith('P2034')
    prisma.transferRule.create.mockRejectedValue(error)
    prisma.transferRule.update.mockRejectedValue(error)
    prisma.transferRule.delete.mockRejectedValue(error)
    await expect(createTransferRule(rule)).rejects.toBe(error)
    await expect(updateTransferRule(1, rule)).rejects.toBe(error)
    await expect(deleteTransferRule(1)).rejects.toBe(error)
  })
})
