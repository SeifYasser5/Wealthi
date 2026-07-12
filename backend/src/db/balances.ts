import { prisma } from './client'
import { BALANCES } from '../utils/constants'
import type { AccountBalance, AccountId } from '../utils/types'
import type { Prisma } from '@prisma/client'

type Db = Prisma.TransactionClient
type OpeningBalances = Record<AccountId, number>

// ---------------------------------------------------------------------------
// Write — store one computed AccountBalance as a monthly_balances row
// ---------------------------------------------------------------------------

/**
 * Stores one computed monthly balance.
 *
 * Uses upsert (not a plain insert) because the cascade re-runs over months
 * that already have rows: a backdated transaction forces a recompute that must
 * overwrite the existing snapshot. First run inserts, later runs update.
 */
export async function upsertBalance(bal: AccountBalance, db: Db = prisma): Promise<void> {
  const { yearMonth, account } = bal

  const data = {
    openingBalance: bal.openingBalance,
    debits: bal.debits,
    credits: bal.credits,
    transfersIn: bal.transfersIn,
    transfersOut: bal.transfersOut ?? 0,
    closingBalance: bal.closingBalance,
    lastReportedBalance: bal.lastReportedBalance,
    discrepancy: bal.discrepancy,
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
 * snapshotted month strictly before it. Falls back to the genesis BALANCES
 * when no earlier snapshot exists (i.e. `yearMonth` is the very first month).
 */
export async function openingFor(yearMonth: string, db: Db = prisma): Promise<OpeningBalances> {
  const prior = await db.monthlyBalance.findFirst({
    where: { yearMonth: { lt: yearMonth } },
    orderBy: { yearMonth: 'desc' },
    select: { yearMonth: true },
  })
  if (!prior) return { ...BALANCES }

  const rows = await db.monthlyBalance.findMany({ where: { yearMonth: prior.yearMonth } })
  const opening = { ...BALANCES }
  for (const row of rows) {
    opening[row.account as AccountId] = row.closingBalance.toNumber()
  }
  return opening
}

/**
 * Upserts all computed balances in parallel.
 * Must be called inside a prisma.$transaction — the caller provides atomicity.
 */
export async function upsertAllBalances(balances: AccountBalance[], db: Db): Promise<void> {
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

/** Distinct transaction months at or after `fromYearMonth`, ascending. */
export async function touchedMonthsFrom(fromYearMonth: string): Promise<string[]> {
  const rows = await prisma.transaction.findMany({
    where: { yearMonth: { gte: fromYearMonth } },
    distinct: ['yearMonth'],
    select: { yearMonth: true },
    orderBy: { yearMonth: 'asc' },
  })
  return rows.map((r) => r.yearMonth)
}

/**
 * Recomputes and stores monthly balance snapshots from `fromYearMonth` forward.
 *
 * Each month's opening balance is the previous month's closing, so a new (or
 * backdated) transaction in month M invalidates M and every later month.
 * Callers pass the earliest month that received new transactions; months
 * before it keep their stored snapshots untouched.
 */
// export async function recomputeFrom(fromYearMonth: string): Promise<void> {
//   let opening = await openingFor(fromYearMonth)
//   const months = await touchedMonthsFrom(fromYearMonth)

//   for (const yearMonth of months) {
//     const transactions = await findByMonth(yearMonth)
//     const nextOpening = { ...opening }

//     for (const account of ALL_ACCOUNTS) {
//       const accountTxs = transactions.filter((tx) => tx.account === account)
//       const bal = computeBalance(account, yearMonth, opening[account] ?? 0, accountTxs)
//       await upsertBalance(bal)
//       nextOpening[account] = bal.closingBalance
//     }

//     opening = nextOpening
//   }
// }
