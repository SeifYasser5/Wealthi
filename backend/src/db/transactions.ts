import { prisma } from './client'
import type {
  AccountId,
  Currency,
  ParsedTransaction,
  StagedTransaction,
  StoredTransaction,
  Transaction as OurTransaction,
} from '../utils/types'
import { decimalToMinor, minorToDecimal, minorToNumber } from '../utils/money'
import type { Prisma, Transaction as PrismaRow } from '@prisma/client'
import type { TransactionFilters } from '@wealthi/shared'

type Db = Prisma.TransactionClient

// ---------------------------------------------------------------------------
// Mapping — Prisma row → our Transaction type
// ---------------------------------------------------------------------------
// Prisma returns DECIMAL columns as Decimal objects (from the decimal.js-light
// library). They are read into integer minor units through their exact
// two-place string (utils/money.ts), so the balance cascade sums integers and
// never floats. Only rows headed for the API become plain numbers (toApi).

function mapRow(row: PrismaRow): StoredTransaction {
  const shared = {
    id: row.id,
    yearMonth: row.yearMonth,
    createdAt: row.createdAt,
    amount: decimalToMinor(row.amount),
    // Prisma enum values are the same string literals as our union types,
    // so the cast is safe — TypeScript structural typing confirms this.
    currency: row.currency as Currency,
    account: row.account as AccountId,
    merchant: row.merchant,
    category: row.category,
    counterAccount: row.counterAccount as AccountId | null,
    reportedBalance: row.reportedBalance === null ? null : decimalToMinor(row.reportedBalance),
    transactedAt: row.transactedAt,
    // The cleaned SMS body this row was parsed from; null on manual/CSV rows.
    rawText: row.rawText,
    // Derived from counterAccount at extraction time — not a stored column.
    isTransfer: row.counterAccount !== null,
  }

  // `type` is the union discriminant; transfers are debit/credit legs that also
  // carry a counterAccount (set above), so there is no separate variant here.
  return row.type === 'credit' ? { ...shared, type: 'credit' } : { ...shared, type: 'debit' }
}

/** The API's shape of a row: money as a plain number of major units. */
function toApi(tx: StoredTransaction): OurTransaction {
  return {
    ...tx,
    amount: minorToNumber(tx.amount),
    reportedBalance: tx.reportedBalance === null ? null : minorToNumber(tx.reportedBalance),
  }
}

// ---------------------------------------------------------------------------
// Input conversion — ParsedTransaction → Prisma create payload
// ---------------------------------------------------------------------------

function toCreateData(
  tx: ParsedTransaction & { messageGuid?: string | null; sourceRowid?: bigint | null; rawText?: string | null },
  yearMonth: string,
): Prisma.TransactionCreateInput {
  return {
    yearMonth,
    type: tx.type,
    amount: minorToDecimal(tx.amount),
    currency: tx.currency,
    account: tx.account,
    merchant: tx.merchant,
    category: tx.category ?? null,
    reportedBalance: tx.reportedBalance === null ? null : minorToDecimal(tx.reportedBalance),
    transactedAt: tx.transactedAt,
    counterAccount: tx.counterAccount,
    // Present only on SMS-derived rows; null for manual/CSV legs. The unique
    // constraint on messageGuid is what makes re-reads idempotent.
    messageGuid: tx.messageGuid ?? null,
    sourceRowid: tx.sourceRowid ?? null,
    rawText: tx.rawText ?? null,
  }
}

/**
 * All transactions at or after `fromYearMonth`, ordered chronologically.
 * One query for the whole cascade range; the caller groups them by month.
 */
export async function findFromMonth(fromYearMonth: string, db: Db = prisma): Promise<StoredTransaction[]> {
  const rows = await db.transaction.findMany({
    where: { yearMonth: { gte: fromYearMonth } },
    orderBy: [{ yearMonth: 'asc' }, { transactedAt: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(mapRow)
}

/**
 * Queries transactions by any combination of yearMonth, account, merchant,
 * direction, and transfer-ness, ordered by transactedAt descending (createdAt
 * as tiebreak).
 */
export async function queryTransactions(filters: TransactionFilters, db: Db = prisma): Promise<OurTransaction[]> {
  const where: Prisma.TransactionWhereInput = {}
  if (filters.yearMonth) where.yearMonth = filters.yearMonth
  if (filters.account) where.account = filters.account
  if (filters.merchant) where.merchant = { contains: filters.merchant, mode: 'insensitive' }
  if (filters.type) where.type = filters.type

  // A specific counter account is the narrower constraint, so it wins over a
  // bare `transfer: 'only'`; the route rejects the contradictory pairing with
  // 'exclude' before we get here.
  if (filters.counterAccount) {
    where.counterAccount = filters.counterAccount
  } else if (filters.transfer === 'only') {
    where.counterAccount = { not: null }
  } else if (filters.transfer === 'exclude') {
    where.counterAccount = null
  }

  const rows = await db.transaction.findMany({
    where,
    orderBy: [{ transactedAt: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map((row) => toApi(mapRow(row)))
}

/**
 * Sets (or clears, with `null`) the manual category on one transaction.
 * Returns the updated row, or null when no transaction has that id.
 *
 * Categories are presentation-only — no balance or transfer state is derived
 * from them — so this never needs a balance recompute.
 */
export async function updateCategory(
  id: string,
  category: string | null,
  db: Db = prisma,
): Promise<OurTransaction | null> {
  try {
    const row = await db.transaction.update({ where: { id }, data: { category } })
    return toApi(mapRow(row))
  } catch (err) {
    // P2025 — "record to update not found". The route turns this into a 404;
    // anything else is a real failure and keeps propagating.
    if ((err as { code?: string }).code === 'P2025') return null
    throw err
  }
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
