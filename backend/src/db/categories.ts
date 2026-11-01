import { prisma } from './client'
import type { Prisma } from '@prisma/client'
import type { Category, Currency, Refusal } from '../utils/types'
import { UNCATEGORIZED } from '../utils/categories'
import { decimalToMinor, minorToDecimal, minorToNumber, type Minor } from '../utils/money'

type Db = Prisma.TransactionClient

// Every list is in the order the Categories page set; id breaks a tie, which
// only a seed or two concurrent creates can leave behind.
const ORDER: Prisma.CategoryOrderByWithRelationInput[] = [{ position: 'asc' }, { id: 'asc' }]

const WITH_USAGE = {
  _count: { select: { transactions: true, schedules: true } },
  merchants: { select: { merchant: true }, orderBy: { merchant: 'asc' } },
} satisfies Prisma.CategoryInclude

type Row = Prisma.CategoryGetPayload<{ include: typeof WITH_USAGE }>

function toCategory(row: Row): Category {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    budget: row.budget === null ? null : minorToNumber(decimalToMinor(row.budget)),
    transactionCount: row._count.transactions,
    scheduleCount: row._count.schedules,
    merchants: row.merchants.map((m) => m.merchant),
  }
}

/** Prisma's code for a unique constraint violation (a name stored twice). */
const UNIQUE_VIOLATION = 'P2002'
/** Prisma's code for a foreign key violation: a category id that isn't stored, or one still in use. */
const FK_VIOLATION = 'P2003'

const code = (err: unknown) => (err as { code?: string }).code

const notFound = (id: number): Refusal => ({ refused: 'not found', error: `category ${id} not found` })
const duplicate = (name: string): Refusal => ({ refused: 'conflict', error: `category "${name}" already exists` })

/** Every category in order, with what uses it. */
export async function listCategories(db: Db = prisma): Promise<Category[]> {
  return (await db.category.findMany({ include: WITH_USAGE, orderBy: ORDER })).map(toCategory)
}

/**
 * The merchant map: merchant → category name. A transaction with no manual
 * category counts towards its merchant's (resolveCategory).
 */
export async function loadMerchantCategories(db: Db = prisma): Promise<Map<string, string>> {
  const rows = await db.merchantCategory.findMany({ select: { merchant: true, category: { select: { name: true } } } })
  return new Map(rows.map((r) => [r.merchant, r.category.name]))
}

/**
 * Refuses a name that differs from a stored one (other than `exceptId`) only
 * in case, or is the Uncategorized bucket's: either would show two
 * indistinguishable lines in the spending breakdown. The unique index catches
 * an exact repeat on its own; this catches the near ones.
 */
async function nameRefusal(name: string, exceptId: number | null, db: Db): Promise<Refusal | null> {
  if (name.toLowerCase() === UNCATEGORIZED.toLowerCase()) {
    return { refused: 'conflict', error: `"${UNCATEGORIZED}" is reserved for rows with no category` }
  }
  const clash = await db.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId === null ? {} : { NOT: { id: exceptId } }) },
  })
  return clash ? duplicate(clash.name) : null
}

/** Adds a category after every stored one. */
export async function createCategory(name: string): Promise<Category | Refusal> {
  try {
    return await prisma.$transaction(async (db) => {
      const refusal = await nameRefusal(name, null, db)
      if (refusal) return refusal
      const { _max } = await db.category.aggregate({ _max: { position: true } })
      const row = await db.category.create({
        data: { name, position: (_max.position ?? -1) + 1 },
        include: WITH_USAGE,
      })
      return toCategory(row)
    })
  } catch (err) {
    if (code(err) === UNIQUE_VIOLATION) return duplicate(name)
    throw err
  }
}

/** Renames a category. Its transactions and merchants follow it: they hold its id, not its name. */
export async function renameCategory(id: number, name: string): Promise<Category | Refusal> {
  try {
    return await prisma.$transaction(async (db) => {
      if (!(await db.category.findUnique({ where: { id } }))) return notFound(id)
      const refusal = await nameRefusal(name, id, db)
      if (refusal) return refusal
      return toCategory(await db.category.update({ where: { id }, data: { name }, include: WITH_USAGE }))
    })
  } catch (err) {
    if (code(err) === UNIQUE_VIOLATION) return duplicate(name)
    throw err
  }
}

/** Sets a category's monthly budget, or clears it with null. */
export async function setCategoryBudget(id: number, budget: Minor | null): Promise<Category | Refusal> {
  try {
    const row = await prisma.category.update({
      where: { id },
      data: { budget: budget === null ? null : minorToDecimal(budget) },
      include: WITH_USAGE,
    })
    return toCategory(row)
  } catch (err) {
    if (code(err) === 'P2025') return notFound(id)
    throw err
  }
}

/**
 * Deletes a category nothing uses. One still assigned to a transaction or a
 * schedule, or mapped from a merchant, is refused with the counts, so the page
 * can say what to move first; the foreign keys refuse it too, should one be
 * assigned in between.
 */
export async function deleteCategory(id: number): Promise<Refusal | null> {
  try {
    return await prisma.$transaction(async (db) => {
      const row = await db.category.findUnique({ where: { id }, include: WITH_USAGE })
      if (!row) return notFound(id)
      const category = toCategory(row)
      if (isInUse(category)) return inUse(category)
      await db.category.delete({ where: { id } })
      return null
    })
  } catch (err) {
    if (code(err) === FK_VIOLATION) return { refused: 'conflict', error: `category ${id} is in use` }
    throw err
  }
}

const isInUse = (c: Category) => c.transactionCount > 0 || c.scheduleCount > 0 || c.merchants.length > 0

function inUse({ name, transactionCount, scheduleCount, merchants }: Category): Refusal {
  const count = (n: number, noun: string) => n > 0 && `${n} ${noun}${n === 1 ? '' : 's'}`
  const uses = [
    count(transactionCount, 'transaction'),
    count(scheduleCount, 'schedule'),
    count(merchants.length, 'merchant'),
  ].filter(Boolean)
  const list = uses.length > 1 ? `${uses.slice(0, -1).join(', ')} and ${uses[uses.length - 1]}` : uses[0]
  return { refused: 'conflict', error: `"${name}" is used by ${list}; move them to another category first` }
}

/**
 * Puts the categories in the order of `ids`, which must name every stored
 * category exactly once: a list missing one was built from a stale page, so it
 * is refused rather than guessed at.
 */
export async function reorderCategories(ids: number[]): Promise<Refusal | null> {
  return prisma.$transaction(async (db) => {
    const stored = (await db.category.findMany({ select: { id: true } })).map((c) => c.id)
    if (stored.length !== ids.length || !stored.every((id) => ids.includes(id))) {
      return { refused: 'conflict', error: 'ids must list every category exactly once; reload and try again' }
    }
    for (const [position, id] of ids.entries()) {
      await db.category.update({ where: { id }, data: { position } })
    }
    return null
  })
}

/**
 * Maps `merchant` to a category, moving it if it was mapped to another, or
 * unmaps it with null. An id that isn't stored is refused by the foreign key.
 */
export async function setMerchantCategory(merchant: string, categoryId: number | null): Promise<Refusal | null> {
  if (categoryId === null) {
    await prisma.merchantCategory.deleteMany({ where: { merchant } })
    return null
  }
  try {
    await prisma.merchantCategory.upsert({
      where: { merchant },
      create: { merchant, categoryId },
      update: { categoryId },
    })
    return null
  } catch (err) {
    if (code(err) === FK_VIOLATION) return { refused: 'invalid', error: `category ${categoryId} does not exist` }
    throw err
  }
}

/** Config's seed keys (merchantCategories, extraCategories). */
export interface CategorySeed {
  merchantCategories: Record<string, string>
  extraCategories: string[]
}

/**
 * Stores the seed's categories, alphabetically, and its merchant map, when no
 * category is stored yet; does nothing otherwise, so the page's edits are
 * never overwritten. Names differing only in case collapse into the first
 * one, and "Uncategorized" is skipped: neither could be created on the page.
 * Returns how many categories were stored.
 */
export async function seedCategories(seed: CategorySeed, db?: Db): Promise<number> {
  const run = async (tx: Db) => {
    if ((await tx.category.count()) > 0) return 0

    const byKey = new Map<string, string>()
    for (const name of [...seed.extraCategories, ...Object.values(seed.merchantCategories)]) {
      const key = name.toLowerCase()
      if (key !== UNCATEGORIZED.toLowerCase() && !byKey.has(key)) byKey.set(key, name)
    }
    const names = [...byKey.values()].sort((a, b) => a.localeCompare(b))
    await tx.category.createMany({ data: names.map((name, position) => ({ name, position })) })

    const ids = new Map((await tx.category.findMany()).map((c) => [c.name.toLowerCase(), c.id]))
    await tx.merchantCategory.createMany({
      data: Object.entries(seed.merchantCategories).flatMap(([merchant, name]) => {
        const categoryId = ids.get(name.toLowerCase())
        return categoryId === undefined ? [] : [{ merchant, categoryId }]
      }),
    })
    return names.length
  }
  return db ? run(db) : prisma.$transaction(run)
}

/**
 * Replaces every category and merchant mapping with the seed's — the demo's
 * reset. Manual and schedule assignments are cleared first, since they'd
 * otherwise hold the old categories in place.
 */
export async function replaceCategories(seed: CategorySeed): Promise<void> {
  await prisma.$transaction(async (db) => {
    await db.transaction.updateMany({ where: { categoryId: { not: null } }, data: { categoryId: null } })
    await db.schedule.updateMany({ where: { categoryId: { not: null } }, data: { categoryId: null } })
    await db.merchantCategory.deleteMany()
    await db.category.deleteMany()
    await seedCategories(seed, db)
  })
}

/** A non-transfer debit with a merchant: what the category suggestions count. */
export interface MerchantDebit {
  merchant: string
  amount: Minor
  currency: Currency
}

/** Every non-transfer debit with a merchant, across all months. */
export async function listMerchantDebits(db: Db = prisma): Promise<MerchantDebit[]> {
  const rows = await db.transaction.findMany({
    where: { type: 'debit', counterAccount: null, merchant: { not: null } },
    select: { merchant: true, amount: true, currency: true },
  })
  return rows.map((r) => ({ merchant: r.merchant as string, amount: decimalToMinor(r.amount), currency: r.currency }))
}
