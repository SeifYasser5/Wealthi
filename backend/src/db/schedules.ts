import { prisma } from './client'
import type { Prisma, Schedule as PrismaRow } from '@prisma/client'
import type { RecurringEntry } from '../utils/config'
import type { Currency, Refusal, Schedule, ScheduleInput, StoredSchedule, TransactionType } from '../utils/types'
import { decimalToMinor, minorToDecimal, minorToNumber, type Minor } from '../utils/money'
import { firstDayOnOrAfter, localDay, nextOccurrence } from '../utils/helpers/schedule'

type Db = Prisma.TransactionClient

const WITH_USAGE = {
  category: { select: { name: true } },
  _count: { select: { transactions: true } },
} satisfies Prisma.ScheduleInclude

type Row = Prisma.ScheduleGetPayload<{ include: typeof WITH_USAGE }>

const ORDER: Prisma.ScheduleOrderByWithRelationInput[] = [{ startDate: 'asc' }, { id: 'asc' }]

/** Prisma's code for "record to update/delete not found". */
const NOT_FOUND = 'P2025'
/** Prisma's code for a foreign key violation: a category id that isn't stored. */
const FK_VIOLATION = 'P2003'

const code = (err: unknown) => (err as { code?: string }).code

// A DATE column comes back as UTC midnight of its day.
const toDay = (date: Date) => date.toISOString().slice(0, 10)
const fromDay = (day: string) => new Date(`${day}T00:00:00Z`)

function toStored(row: PrismaRow): StoredSchedule {
  return {
    id: row.id,
    type: row.type,
    amount: decimalToMinor(row.amount),
    currency: row.currency,
    account: row.account,
    merchant: row.merchant,
    categoryId: row.categoryId,
    frequency: row.frequency,
    interval: row.interval,
    startDate: toDay(row.startDate),
    endDate: row.endDate === null ? null : toDay(row.endDate),
  }
}

function toApi(row: Row, today: string): Schedule {
  const stored = toStored(row)
  return {
    ...stored,
    amount: minorToNumber(stored.amount),
    category: row.category?.name ?? null,
    nextDate: nextOccurrence(stored, today),
    transactionCount: row._count.transactions,
  }
}

function toData(input: ScheduleInput): Prisma.ScheduleUncheckedCreateInput {
  return {
    ...input,
    amount: minorToDecimal(input.amount),
    startDate: fromDay(input.startDate),
    endDate: input.endDate === null ? null : fromDay(input.endDate),
  }
}

const notFound = (id: number): Refusal => ({ refused: 'not found', error: `schedule ${id} not found` })
const noCategory = (input: ScheduleInput): Refusal => ({
  refused: 'invalid',
  error: `category ${input.categoryId} does not exist`,
})

/** Every schedule, by start date, with its next occurrence after `now`'s day. */
export async function listSchedules(now = new Date()): Promise<Schedule[]> {
  const rows = await prisma.schedule.findMany({ include: WITH_USAGE, orderBy: ORDER })
  return rows.map((row) => toApi(row, localDay(now)))
}

/** Every schedule, for the import to expand into transactions. */
export async function loadSchedules(db: Db = prisma): Promise<StoredSchedule[]> {
  return (await db.schedule.findMany({ orderBy: ORDER })).map(toStored)
}

/** Stores a schedule. A category id that isn't stored is refused by the foreign key. */
export async function createSchedule(input: ScheduleInput, now = new Date()): Promise<Schedule | Refusal> {
  try {
    const row = await prisma.schedule.create({ data: toData(input), include: WITH_USAGE })
    return toApi(row, localDay(now))
  } catch (err) {
    if (code(err) === FK_VIOLATION) return noCategory(input)
    throw err
  }
}

/**
 * Replaces a schedule. Its stored occurrences keep the old values until the
 * next import regenerates them.
 */
export async function updateSchedule(id: number, input: ScheduleInput, now = new Date()): Promise<Schedule | Refusal> {
  try {
    const row = await prisma.schedule.update({ where: { id }, data: toData(input), include: WITH_USAGE })
    return toApi(row, localDay(now))
  } catch (err) {
    if (code(err) === NOT_FOUND) return notFound(id)
    if (code(err) === FK_VIOLATION) return noCategory(input)
    throw err
  }
}

/**
 * Deletes a schedule. Its stored occurrences lose their mark (the foreign key
 * sets it null) and stay, so balances still match them, until the next import
 * leaves them out.
 */
export async function deleteSchedule(id: number): Promise<Refusal | null> {
  try {
    await prisma.schedule.delete({ where: { id } })
    return null
  } catch (err) {
    if (code(err) === NOT_FOUND) return notFound(id)
    throw err
  }
}

/** A ledger row the schedule suggestions look at. */
export interface RecurringCandidate {
  merchant: string
  type: TransactionType
  amount: Minor
  currency: Currency
  account: string
  /** The local calendar day, "YYYY-MM-DD". */
  day: string
}

/**
 * Every non-transfer SMS or manual transaction with a merchant that no schedule
 * made, across all months. Schedule occurrences are left out: they are already
 * scheduled.
 */
export async function listRecurringCandidates(db: Db = prisma): Promise<RecurringCandidate[]> {
  const rows = await db.transaction.findMany({
    where: { type: { in: ['debit', 'credit'] }, counterAccount: null, merchant: { not: null }, scheduleId: null },
    select: { merchant: true, type: true, amount: true, currency: true, account: true, transactedAt: true },
  })
  return rows.map((r) => ({
    merchant: r.merchant as string,
    type: r.type as TransactionType,
    amount: decimalToMinor(r.amount),
    currency: r.currency,
    account: r.account,
    day: localDay(r.transactedAt),
  }))
}

/** The merchants some schedule already covers. */
export async function listScheduledMerchants(db: Db = prisma): Promise<Set<string>> {
  const rows = await db.schedule.findMany({ select: { merchant: true }, distinct: ['merchant'] })
  return new Set(rows.map((r) => r.merchant))
}

/**
 * Stores config's recurringTransactions as monthly schedules when no schedule
 * is stored yet; does nothing otherwise, so the Schedules page's edits are
 * never overwritten. Returns how many were stored.
 */
export async function seedSchedules(entries: RecurringEntry[], db: Db = prisma): Promise<number> {
  if ((await db.schedule.count()) > 0) return 0
  const { count } = await db.schedule.createMany({
    data: entries.map(({ startYearMonth, dayOfMonth, ...entry }) =>
      toData({
        ...entry,
        categoryId: null,
        frequency: 'monthly',
        interval: 1,
        startDate: firstDayOnOrAfter(startYearMonth, dayOfMonth),
        endDate: null,
      }),
    ),
  })
  return count
}

/** Replaces every schedule with config's — the demo's reset. */
export async function replaceSchedules(entries: RecurringEntry[]): Promise<void> {
  await prisma.$transaction(async (db) => {
    await db.schedule.deleteMany()
    await seedSchedules(entries, db)
  })
}
