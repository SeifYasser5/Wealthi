import { existsSync } from 'node:fs'
import { readMessages } from './ingest/reader'
import type {
  DbRow,
  StagedTransaction,
  AccountBalance,
  AccountId,
  StageMessages,
  RecomputeBalance,
  ImportError,
  ImportSummary,
} from '../utils/types'
import { ALL_ACCOUNTS, config } from '../utils/config'
import { decode } from './ingest/decode'
import { parseWithPatterns } from './ingest/patterns/parser'
import { classifyTransfer } from './ingest/transfer'
import { toYearMonth, monthRange } from '../utils/helpers'
import { openingFor, upsertAllBalances } from '../db/balances'
import { computeBalance } from './ingest/balance'
import { findFromMonth, createAllTransactions } from '../db/transactions'
import { getImportCursor, setImportCursor } from '../db/import-state'
import { prisma } from '../db/client'

/**
 * Reads new bank SMS from chat.db, parses them into transactions, and refreshes
 * the affected monthly balance snapshots.
 *
 * The cursor makes imports incremental: only messages after the last stored
 * rowid are read. Transactions, balances, and the advanced cursor are written
 * in a single atomic transaction so a partial import never leaves the cursor
 * ahead of the data it represents.
 */
export const importFromChatDb = async (chatDbPath: string, now: Date = new Date()): Promise<ImportSummary> => {
  if (!existsSync(chatDbPath)) throw new Error(`chat.db not found at: ${chatDbPath}`)

  const cursor = await getImportCursor()
  const messages = readMessages(chatDbPath, config.bankSenders, cursor)
  const { transactions, errors, earliest, maxRowid } = stageMessages(messages)
  if (transactions.length === 0 || earliest === null || maxRowid === null) return { months: 0, totalStored: 0, errors }
  const { balances, months } = await recomputeBalances(transactions, earliest, toYearMonth(now))

  await prisma.$transaction(
    async (db) => {
      await createAllTransactions(transactions, db)
      await upsertAllBalances(balances, db)
      await setImportCursor(maxRowid, db)
    },
    { timeout: 120_000 },
  )

  return { months, totalStored: transactions.length, errors }
}

/**
 * Runs each raw message through decode → parse → classify, collecting the
 * staged transactions alongside the bookkeeping the caller needs:
 * `maxRowid` to advance the cursor and `earliest` to bound the balance recompute.
 * Parse failures are collected as errors rather than thrown, so one bad message
 * never aborts the import.
 */
const stageMessages = (messages: DbRow[]): StageMessages => {
  const transactions: StagedTransaction[] = []
  const errors: ImportError[] = []
  let earliest: string | null = null
  let maxRowid: bigint | null = null

  for (const raw of messages) {
    if (maxRowid === null || raw.rowid > maxRowid) maxRowid = raw.rowid

    const decoded = decode(raw)

    const parsed = parseWithPatterns(decoded)
    if (!parsed.ok) {
      // Skipped on purpose (a foreign-currency charge) — not an error.
      if (!parsed.skipped) errors.push({ stage: 'parse', decoded, cause: parsed.error })
      continue
    }

    const tx = classifyTransfer(parsed.value)

    const yearMonth = toYearMonth(tx.transactedAt)
    transactions.push({ ...tx, yearMonth })
    if (earliest === null || yearMonth < earliest) earliest = yearMonth
  }

  return { transactions, errors, earliest, maxRowid }
}

/**
 * Recomputes per-account balance snapshots for every month from `earliest`
 * (the oldest month touched by this import) through `through` (the current
 * month, passed in by the caller so the cascade boundary is deterministic).
 *
 * Already-stored transactions for those months are merged with the newly staged
 * ones so each snapshot reflects the full month, not just the new rows. The
 * cascade carries each month's closing balances forward as the next month's
 * opening, which is why a single backdated transaction must redo every later
 * month.
 */
const recomputeBalances = async (staged: StagedTransaction[], earliest: string, through: string): RecomputeBalance => {
  const months = monthRange(earliest, through)
  const stored = await findFromMonth(earliest)
  const byMonth = groupByMonth([...stored, ...staged])
  const balances: AccountBalance[] = []
  let opening = await openingFor(months[0])

  for (const yearMonth of months) {
    const byAccount = byMonth.get(yearMonth)
    const nextOpening = { ...opening }

    for (const account of ALL_ACCOUNTS) {
      const accountTxs = byAccount?.get(account) ?? []
      const balance = computeBalance(account, yearMonth, opening[account], accountTxs)
      balances.push(balance)
      nextOpening[account] = balance.closingBalance
    }
    opening = nextOpening
  }

  return { balances, months: months.length }
}

/** Buckets transactions by month, then by account, for the balance cascade. */
const groupByMonth = (transactions: StagedTransaction[]): Map<string, Map<AccountId, StagedTransaction[]>> => {
  const byMonth = new Map<string, Map<AccountId, StagedTransaction[]>>()
  for (const tx of transactions) {
    let byAccount = byMonth.get(tx.yearMonth)
    if (!byAccount) {
      byAccount = new Map<AccountId, StagedTransaction[]>()
      byMonth.set(tx.yearMonth, byAccount)
    }
    const bucket = byAccount.get(tx.account)
    if (bucket) bucket.push(tx)
    else byAccount.set(tx.account, [tx])
  }
  return byMonth
}
