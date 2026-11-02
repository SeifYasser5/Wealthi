import { prisma } from './client'
import type { ManualTransaction as PrismaRow, Prisma } from '@prisma/client'
import type { ManualEntry } from '../utils/config'
import type { ManualTransaction, ManualTransactionInput, Refusal, StoredManualTransaction } from '../utils/types'
import { decimalToMinor, minorToDecimal, minorToNumber } from '../utils/money'

type Db = Prisma.TransactionClient

const WITH_CATEGORY = { category: { select: { name: true } } } satisfies Prisma.ManualTransactionInclude

type Row = Prisma.ManualTransactionGetPayload<{ include: typeof WITH_CATEGORY }>

/** Newest first, as the page lists them; the import doesn't care about the order. */
const ORDER: Prisma.ManualTransactionOrderByWithRelationInput[] = [{ date: 'desc' }, { id: 'desc' }]

/** Prisma's code for "record to update/delete not found". */
const NOT_FOUND = 'P2025'
/** Prisma's code for a foreign key violation: a category id that isn't stored. */
const FK_VIOLATION = 'P2003'

const code = (err: unknown) => (err as { code?: string }).code

// A DATE column comes back as UTC midnight of its day.
const toDay = (date: Date) => date.toISOString().slice(0, 10)
const fromDay = (day: string) => new Date(`${day}T00:00:00Z`)

function toStored(row: PrismaRow): StoredManualTransaction {
  return {
    id: row.id,
    type: row.type,
    amount: decimalToMinor(row.amount),
    currency: row.currency,
    account: row.account,
    merchant: row.merchant,
    categoryId: row.categoryId,
    date: toDay(row.date),
  }
}

function toApi(row: Row): ManualTransaction {
  const stored = toStored(row)
  return { ...stored, amount: minorToNumber(stored.amount), category: row.category?.name ?? null }
}

function toData(input: ManualTransactionInput): Prisma.ManualTransactionUncheckedCreateInput {
  return { ...input, amount: minorToDecimal(input.amount), date: fromDay(input.date) }
}

const notFound = (id: number): Refusal => ({ refused: 'not found', error: `manual transaction ${id} not found` })
const noCategory = (input: ManualTransactionInput): Refusal => ({
  refused: 'invalid',
  error: `category ${input.categoryId} does not exist`,
})

/** The dates of a "YYYY-MM" month: from its first day up to, not including, the next month's. */
function monthRange(yearMonth: string): Prisma.DateTimeFilter {
  const [y, m] = yearMonth.split('-').map(Number)
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) }
}

/** The manual transactions of `yearMonth` ("YYYY-MM"), or every one without it, newest first. */
export async function listManualTransactions(yearMonth?: string): Promise<ManualTransaction[]> {
  const rows = await prisma.manualTransaction.findMany({
    where: yearMonth === undefined ? undefined : { date: monthRange(yearMonth) },
    include: WITH_CATEGORY,
    orderBy: ORDER,
  })
  return rows.map(toApi)
}

/** Every manual transaction, for the import to copy into the ledger. */
export async function loadManualTransactions(db: Db = prisma): Promise<StoredManualTransaction[]> {
  return (await db.manualTransaction.findMany({ orderBy: ORDER })).map(toStored)
}

/** Stores a manual transaction. A category id that isn't stored is refused by the foreign key. */
export async function createManualTransaction(input: ManualTransactionInput): Promise<ManualTransaction | Refusal> {
  try {
    return toApi(await prisma.manualTransaction.create({ data: toData(input), include: WITH_CATEGORY }))
  } catch (err) {
    if (code(err) === FK_VIOLATION) return noCategory(input)
    throw err
  }
}

/** Replaces a manual transaction. Its ledger row keeps the old values until the next import. */
export async function updateManualTransaction(
  id: number,
  input: ManualTransactionInput,
): Promise<ManualTransaction | Refusal> {
  try {
    return toApi(await prisma.manualTransaction.update({ where: { id }, data: toData(input), include: WITH_CATEGORY }))
  } catch (err) {
    if (code(err) === NOT_FOUND) return notFound(id)
    if (code(err) === FK_VIOLATION) return noCategory(input)
    throw err
  }
}

/** Deletes a manual transaction. Its ledger row stays until the next import leaves it out. */
export async function deleteManualTransaction(id: number): Promise<Refusal | null> {
  try {
    await prisma.manualTransaction.delete({ where: { id } })
    return null
  } catch (err) {
    if (code(err) === NOT_FOUND) return notFound(id)
    throw err
  }
}

/**
 * Copies config's manualTransactions into the table when it is empty; does
 * nothing otherwise, so the Settings → Manual edits are never overwritten and the
 * config file is never changed. Returns how many were stored.
 */
export async function seedManualTransactions(entries: ManualEntry[], db: Db = prisma): Promise<number> {
  if ((await db.manualTransaction.count()) > 0) return 0
  const { count } = await db.manualTransaction.createMany({
    data: entries.map(({ date, ...entry }) => toData({ ...entry, categoryId: null, date })),
  })
  return count
}

/** Replaces every manual transaction with config's — the demo's reset. */
export async function replaceManualTransactions(entries: ManualEntry[]): Promise<void> {
  await prisma.$transaction(async (db) => {
    await db.manualTransaction.deleteMany()
    await seedManualTransactions(entries, db)
  })
}
