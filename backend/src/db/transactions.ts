import { prisma } from './client'
import type {
  AccountId,
  Currency,
  ParsedTransaction,
  StagedTransaction,
  Transaction as OurTransaction,
} from '../utils/types'
import type { Prisma, Transaction as PrismaRow } from '@prisma/client'

type Db = Prisma.TransactionClient

// ---------------------------------------------------------------------------
// Mapping — Prisma row → our Transaction type
// ---------------------------------------------------------------------------
// Prisma returns DECIMAL columns as Decimal objects (from the decimal.js-light
// library). We convert them to plain numbers; the amounts in this app are
// well within float64 precision (max ~100 million EGP, 2 decimal places).

function toNumber(d: Prisma.Decimal | null): number | null {
  return d === null ? null : d.toNumber()
}

function mapRow(row: PrismaRow): OurTransaction {
  const shared = {
    id: row.id,
    yearMonth: row.yearMonth,
    createdAt: row.createdAt,
    amount: row.amount.toNumber(),
    // Prisma enum values are the same string literals as our union types,
    // so the cast is safe — TypeScript structural typing confirms this.
    currency: row.currency as Currency,
    account: row.account as AccountId,
    merchant: row.merchant,
    counterAccount: row.counterAccount as AccountId | null,
    reportedBalance: toNumber(row.reportedBalance),
    transactedAt: row.transactedAt,
    raw: row.raw,
    // Derived from counterAccount at extraction time — not a stored column.
    isTransfer: row.counterAccount !== null,
  }

  // `type` is the union discriminant; transfers are debit/credit legs that also
  // carry a counterAccount (set above), so there is no separate variant here.
  return row.type === 'credit' ? { ...shared, type: 'credit' } : { ...shared, type: 'debit' }
}

// ---------------------------------------------------------------------------
// Input conversion — ParsedTransaction → Prisma create payload
// ---------------------------------------------------------------------------

function toCreateData(
  tx: ParsedTransaction & { messageGuid?: string | null; sourceRowid?: bigint | null },
  yearMonth: string,
): Prisma.TransactionCreateInput {
  return {
    yearMonth,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    account: tx.account,
    merchant: tx.merchant,
    reportedBalance: tx.reportedBalance,
    transactedAt: tx.transactedAt,
    raw: '',
    counterAccount: tx.counterAccount,
    // Present only on SMS-derived rows; null for manual/CSV legs. The unique
    // constraint on messageGuid is what makes re-reads idempotent.
    messageGuid: tx.messageGuid ?? null,
    sourceRowid: tx.sourceRowid ?? null,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Inserts a single parsed transaction and returns it with generated id and createdAt. */
export async function insert(tx: ParsedTransaction, yearMonth: string): Promise<OurTransaction> {
  const row = await prisma.transaction.create({ data: toCreateData(tx, yearMonth) })
  return mapRow(row)
}

/**
 * Inserts a batch of transactions. When called with a transaction client `db`,
 * atomicity is guaranteed by the caller's surrounding `$transaction`. When
 * called on the bare prisma client each create runs in its own implicit tx.
 */
export async function insertMany(
  txs: ParsedTransaction[],
  yearMonth: string,
  db: Db = prisma,
): Promise<OurTransaction[]> {
  if (txs.length === 0) return []
  const rows = await Promise.all(txs.map((tx) => db.transaction.create({ data: toCreateData(tx, yearMonth) })))
  return rows.map(mapRow)
}

/** The most recent month ("YYYY-MM") that has any stored transaction, or null when empty. */
export async function latestStoredMonth(db: Db = prisma): Promise<string | null> {
  const row = await db.transaction.findFirst({
    orderBy: { yearMonth: 'desc' },
    select: { yearMonth: true },
  })
  return row?.yearMonth ?? null
}

/** All transactions for a calendar month, ordered by transactedAt then createdAt. */
export async function findByMonth(yearMonth: string, db: Db = prisma): Promise<OurTransaction[]> {
  const rows = await db.transaction.findMany({
    where: { yearMonth },
    orderBy: [{ transactedAt: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(mapRow)
}

/**
 * All transactions at or after `fromYearMonth`, ordered chronologically.
 * One query for the whole cascade range; the caller groups them by month.
 */
export async function findFromMonth(fromYearMonth: string, db: Db = prisma): Promise<OurTransaction[]> {
  const rows = await db.transaction.findMany({
    where: { yearMonth: { gte: fromYearMonth } },
    orderBy: [{ yearMonth: 'asc' }, { transactedAt: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(mapRow)
}

/**
 * Deletes all transactions for a calendar month.
 * Used before re-importing to keep runs idempotent.
 * Returns the number of rows deleted.
 */
export async function deleteByMonth(yearMonth: string): Promise<number> {
  const { count } = await prisma.transaction.deleteMany({ where: { yearMonth } })
  return count
}

/**
 * Transactions for one account, optionally scoped to a single month.
 * Results are ordered chronologically (nulls last).
 */
export async function findByAccount(account: AccountId, yearMonth?: string): Promise<OurTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: yearMonth ? { account, yearMonth } : { account },
    orderBy: { transactedAt: 'asc' },
  })
  return rows.map(mapRow)
}

/** Filters for the transaction listing endpoint. All are optional and AND-combined. */
export interface TransactionQuery {
  yearMonth?: string
  account?: AccountId
  /** Case-insensitive substring match against the merchant name. */
  merchant?: string
}

/**
 * Queries transactions by any combination of yearMonth, account, and merchant,
 * ordered by transactedAt descending (createdAt as tiebreak).
 */
export async function queryTransactions(filters: TransactionQuery, db: Db = prisma): Promise<OurTransaction[]> {
  const where: Prisma.TransactionWhereInput = {}
  if (filters.yearMonth) where.yearMonth = filters.yearMonth
  if (filters.account) where.account = filters.account
  if (filters.merchant) where.merchant = { contains: filters.merchant, mode: 'insensitive' }

  const rows = await db.transaction.findMany({
    where,
    orderBy: [{ transactedAt: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map(mapRow)
}

/**
 * Inserts all staged transactions in one createMany call.
 * Must be called inside a prisma.$transaction — the caller provides atomicity.
 *
 * `skipDuplicates` makes the insert idempotent against the unique `messageGuid`:
 * a message re-read because the cursor was reset, or because chat.db ROWIDs were
 * reordered (e.g. a VACUUM), is silently skipped instead of duplicated.
 *
 * Returns the number of rows actually created (duplicates excluded).
 */
export async function createAllTransactions(txs: StagedTransaction[], db: Db): Promise<number> {
  if (txs.length === 0) return 0
  const { count } = await db.transaction.createMany({
    data: txs.map((tx) => toCreateData(tx, tx.yearMonth)),
  })
  return count
}
