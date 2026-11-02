import { prisma } from './client'
import type { Prisma } from '@prisma/client'
import { config } from '../utils/config'
import type { Account, AccountId, AccountInput, AccountSource, Refusal, StoredAccount } from '../utils/types'
import { decimalToMinor, minorToDecimal, minorToNumber } from '../utils/money'

type Db = Prisma.TransactionClient

/** The order every account list shows them in; id breaks a tie a seed can leave. */
const ORDER: Prisma.AccountOrderByWithRelationInput[] = [{ position: 'asc' }, { id: 'asc' }]

/** Prisma's code for a unique constraint violation (an id stored twice). */
const UNIQUE_VIOLATION = 'P2002'
/** Prisma's code for a foreign key violation: an account id that isn't stored, or one still in use. */
const FK_VIOLATION = 'P2003'
/** Prisma's code for "record to update/delete not found". */
const NOT_FOUND = 'P2025'

const code = (err: unknown) => (err as { code?: string }).code

type Row = Prisma.AccountGetPayload<object>

function toStored(row: Row): StoredAccount {
  return {
    id: row.id,
    label: row.label,
    currency: row.currency,
    openingBalance: decimalToMinor(row.openingBalance),
  }
}

function toApi(row: Row): Account {
  const { openingBalance, ...account } = toStored(row)
  return { ...account, openingBalance: minorToNumber(openingBalance) }
}

const notFound = (id: AccountId): Refusal => ({ refused: 'not found', error: `account "${id}" not found` })

/** Your accounts in display order, as the API serves them. */
export async function listAccounts(db: Db = prisma): Promise<Account[]> {
  return (await db.account.findMany({ orderBy: ORDER })).map(toApi)
}

/** Your accounts in display order, with the opening balance in minor units, for the import. */
export async function loadAccounts(db: Db = prisma): Promise<StoredAccount[]> {
  return (await db.account.findMany({ orderBy: ORDER })).map(toStored)
}

/** Adds an account after every stored one. */
export async function createAccount(input: AccountInput): Promise<Account | Refusal> {
  try {
    return await prisma.$transaction(async (db) => {
      const { _max } = await db.account.aggregate({ _max: { position: true } })
      const row = await db.account.create({
        data: {
          id: input.id,
          label: input.label,
          currency: input.currency,
          openingBalance: minorToDecimal(input.openingBalance),
          position: (_max.position ?? -1) + 1,
        },
      })
      return toApi(row)
    })
  } catch (err) {
    if (code(err) === UNIQUE_VIOLATION) return { refused: 'conflict', error: `account "${input.id}" already exists` }
    throw err
  }
}

/**
 * Renames an account or changes its opening balance. The id and the currency
 * stay: every ledger row holds the id, and the currency is what its amounts are in.
 * The opening balance reaches the balances at the next import.
 */
export async function updateAccount(
  id: AccountId,
  changes: Pick<AccountInput, 'label' | 'openingBalance'>,
): Promise<Account | Refusal> {
  try {
    const row = await prisma.account.update({
      where: { id },
      data: { label: changes.label, openingBalance: minorToDecimal(changes.openingBalance) },
    })
    return toApi(row)
  } catch (err) {
    if (code(err) === NOT_FOUND) return notFound(id)
    throw err
  }
}

/** What still names an account, by where; the import file's csvImports count too. */
async function usesOf(id: AccountId, db: Db): Promise<[string, number][]> {
  const named = { account: id }
  const [transactions, schedules, manual, balances, sources, rules] = await Promise.all([
    db.transaction.count({ where: { OR: [named, { counterAccount: id }] } }),
    db.schedule.count({ where: named }),
    db.manualTransaction.count({ where: named }),
    db.monthlyBalance.count({ where: named }),
    db.accountSource.count({ where: { accountId: id } }),
    db.transferRule.count({ where: { OR: [{ accountId: id }, { counterAccountId: id }] } }),
  ])
  const csvImports = config.csvImports.filter((c) => c.account === id || c.counterAccount === id).length
  return [
    ['transaction', transactions],
    ['schedule', schedules],
    ['manual transaction', manual],
    ['monthly balance', balances],
    ['source', sources],
    ['transfer rule', rules],
    ['CSV import', csvImports],
  ]
}

/**
 * Deletes an account nothing names. One that still has transactions, balances,
 * schedules, manual transactions, sources, transfer rules or CSV imports is
 * refused with the counts, so the page can say what to move first.
 */
export async function deleteAccount(id: AccountId): Promise<Refusal | null> {
  try {
    return await prisma.$transaction(async (db) => {
      if (!(await db.account.findUnique({ where: { id } }))) return notFound(id)
      const uses = (await usesOf(id, db)).filter(([, n]) => n > 0)
      if (uses.length > 0) {
        const list = uses.map(([noun, n]) => `${n} ${noun}${n === 1 ? '' : 's'}`)
        const text = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]
        return { refused: 'conflict', error: `"${id}" is used by ${text}; remove them first` }
      }
      await db.account.delete({ where: { id } })
      return null
    })
  } catch (err) {
    if (code(err) === FK_VIOLATION) return { refused: 'conflict', error: `account "${id}" is in use` }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Every source key with its account, by key. */
export async function listAccountSources(db: Db = prisma): Promise<AccountSource[]> {
  const rows = await db.accountSource.findMany({ orderBy: { source: 'asc' } })
  return rows.map((r) => ({ source: r.source, account: r.accountId }))
}

/** The source → account map the parser reads. */
export async function loadAccountSources(db: Db = prisma): Promise<Record<string, AccountId>> {
  return Object.fromEntries((await listAccountSources(db)).map((s) => [s.source, s.account]))
}

/** Maps a source key to an account, moving it if it was mapped to another. An account that isn't stored is refused. */
export async function setAccountSource(source: string, account: AccountId): Promise<AccountSource | Refusal> {
  try {
    await prisma.accountSource.upsert({
      where: { source },
      create: { source, accountId: account },
      update: { accountId: account },
    })
    return { source, account }
  } catch (err) {
    if (code(err) === FK_VIOLATION) return { refused: 'invalid', error: `account "${account}" does not exist` }
    throw err
  }
}

/** Removes a source key; messages on it become parse errors until it is mapped again. */
export async function deleteAccountSource(source: string): Promise<Refusal | null> {
  const { count } = await prisma.accountSource.deleteMany({ where: { source } })
  return count === 0 ? { refused: 'not found', error: `source "${source}" not found` } : null
}
