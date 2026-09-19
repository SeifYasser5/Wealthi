import { prisma } from './client'
import { config } from '../utils/config'
import type { AccountBalance, AccountId, MinorBalance } from '../utils/types'
import { decimalToMinor, minorToDecimal, type Minor } from '../utils/money'
import type { Prisma } from '@prisma/client'

type Db = Prisma.TransactionClient
type OpeningBalances = Record<AccountId, Minor>

const toDecimal = (m: Minor | null) => (m === null ? null : minorToDecimal(m))

// ---------------------------------------------------------------------------
// Write — store one computed balance as a monthly_balances row
// ---------------------------------------------------------------------------

/**
 * Stores one computed monthly balance.
 *
 * Uses upsert (not a plain insert) because the cascade re-runs over months
 * that already have rows: a backdated transaction forces a recompute that must
 * overwrite the existing snapshot. First run inserts, later runs update.
 */
export async function upsertBalance(bal: MinorBalance, db: Db = prisma): Promise<void> {
  const { yearMonth, account } = bal

  const data = {
    openingBalance: minorToDecimal(bal.openingBalance),
    debits: minorToDecimal(bal.debits),
    credits: minorToDecimal(bal.credits),
    transfersIn: minorToDecimal(bal.transfersIn),
    transfersOut: minorToDecimal(bal.transfersOut),
    closingBalance: minorToDecimal(bal.closingBalance),
    lastReportedBalance: toDecimal(bal.lastReportedBalance),
    discrepancy: toDecimal(bal.discrepancy),
  }

  await db.monthlyBalance.upsert({
    where: { yearMonth_account: { yearMonth, account } },
    create: { yearMonth, account, ...data },
    update: { ...data, computedAt: new Date() },
  })
}

// ---------------------------------------------------------------------------
// Recompute cascade
// ---------------------------------------------------------------------------

/**
 * Opening balances for `yearMonth` = closing balances of the most recent
 * snapshotted month strictly before it. Falls back to the genesis openingBalances
 * when no earlier snapshot exists (i.e. `yearMonth` is the very first month).
 */
export async function openingFor(yearMonth: string, db: Db = prisma): Promise<OpeningBalances> {
  const prior = await db.monthlyBalance.findFirst({
    where: { yearMonth: { lt: yearMonth } },
    orderBy: { yearMonth: 'desc' },
    select: { yearMonth: true },
  })
  if (!prior) return { ...config.openingBalances }

  const rows = await db.monthlyBalance.findMany({ where: { yearMonth: prior.yearMonth } })
  const opening = { ...config.openingBalances }
  for (const row of rows) {
    opening[row.account as AccountId] = decimalToMinor(row.closingBalance)
  }
  return opening
}

/**
 * Upserts all computed balances in parallel.
 * Must be called inside a prisma.$transaction — the caller provides atomicity.
 */
export async function upsertAllBalances(balances: MinorBalance[], db: Db): Promise<void> {
  await Promise.all(balances.map((bal) => upsertBalance(bal, db)))
}

/**
 * All stored monthly balance snapshots for one calendar month, one per account,
 * ordered by account. Decimal columns are converted to plain numbers to match
 * the `AccountBalance` shape used elsewhere.
 */
export async function findBalancesByMonth(yearMonth: string, db: Db = prisma): Promise<AccountBalance[]> {
  const rows = await db.monthlyBalance.findMany({
    where: { yearMonth },
    orderBy: { account: 'asc' },
  })
  return rows.map((row) => ({
    account: row.account as AccountId,
    yearMonth: row.yearMonth,
    openingBalance: row.openingBalance.toNumber(),
    debits: row.debits.toNumber(),
    credits: row.credits.toNumber(),
    transfersIn: row.transfersIn.toNumber(),
    transfersOut: row.transfersOut.toNumber(),
    closingBalance: row.closingBalance.toNumber(),
    lastReportedBalance: row.lastReportedBalance === null ? null : row.lastReportedBalance.toNumber(),
    discrepancy: row.discrepancy === null ? null : row.discrepancy.toNumber(),
  }))
}
