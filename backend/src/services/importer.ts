import { existsSync } from 'node:fs'
import { readMessages } from './ingest/reader'
import type { DbRow, StagedTransaction, MinorBalance, StageMessages, RecomputeBalance } from '../utils/types'
import { ALL_ACCOUNTS, config } from '../utils/config'
import { decode } from './ingest/decode'
import { parser } from './ingest/parser'
import { classifyTransfer } from './ingest/transfer'
import { toYearMonth } from '../utils/helpers'
import { upsertAllBalances } from '../db/balances'
import { computeBalance } from './ingest/balance'
import { createAllTransactions } from '../db/transactions'
import { prisma } from '../db/client'
import { ImportError, ImportSummary } from '../utils/types'
import { loadCsvTransactions } from '../utils/helpers/csv-import'
import { manualTransactions } from '../utils/helpers/manual-transactions'

export async function importFromChatDb(chatDbPath: string): Promise<ImportSummary> {
  if (!existsSync(chatDbPath)) throw new Error(`chat.db not found at: ${chatDbPath}`)

  const messages = readMessages(chatDbPath, config.bankSenders, undefined)
  const { transactions, errors, earliest } = stageMessages(messages)
  if (transactions.length === 0 || earliest === null) return { months: 0, totalStored: 0, errors }
  const { balances, months } = await recomputeBalances(transactions)

  await prisma.$transaction(
    async (db) => {
      await db.monthlyBalance.deleteMany({})
      await db.transaction.deleteMany({})
      await createAllTransactions(transactions, db)
      await upsertAllBalances(balances, db)
    },
    { timeout: 120_000 },
  )

  return { months, totalStored: transactions.length, errors }
}

function stageMessages(messages: DbRow[]): StageMessages {
  const transactions: StagedTransaction[] = []
  const errors: ImportError[] = []
  let earliest: string | null = null
  let maxRowid: bigint | null = null

  for (const raw of messages) {
    if (maxRowid === null || raw.rowid > maxRowid) maxRowid = raw.rowid

    const decoded = decode(raw)

    const parsed = parser(decoded)
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

async function recomputeBalances(staged: StagedTransaction[]): RecomputeBalance {
  const stored = manualTransactions
  const byMonth = groupByMonth([...stored, ...staged])
  const months = [...byMonth.keys()].sort().slice(-6)
  const balances: MinorBalance[] = []
  let opening = { ...config.openingBalances }

  for (const yearMonth of months) {
    const csv = loadCsvTransactions(yearMonth)
    const monthTxs = [...(byMonth.get(yearMonth) ?? []), ...csv]
    const nextOpening = { ...opening }

    for (const account of ALL_ACCOUNTS) {
      const accountTxs = monthTxs.filter((t) => t.account === account)
      const balance = computeBalance(account, yearMonth, opening[account], accountTxs)
      balances.push(balance)
      nextOpening[account] = balance.closingBalance
    }
    opening = nextOpening
  }

  return { balances, months: months.length }
}

function groupByMonth(transactions: StagedTransaction[]): Map<string, StagedTransaction[]> {
  const byMonth = new Map<string, StagedTransaction[]>()
  for (const tx of transactions) {
    const bucket = byMonth.get(tx.yearMonth)
    if (bucket) bucket.push(tx)
    else byMonth.set(tx.yearMonth, [tx])
  }
  return byMonth
}
