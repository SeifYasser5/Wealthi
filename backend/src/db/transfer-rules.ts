import { prisma } from './client'
import type { Prisma, TransferRule as PrismaRow } from '@prisma/client'
import type { Refusal, StoredTransferRule, TransferRule, TransferRuleInput } from '../utils/types'

type Db = Prisma.TransactionClient

/**
 * Rules with a merchant first, then the catch-alls, each group in the order
 * stored: the import takes the first match, so a rule for one merchant must
 * not be shadowed by "any merchant" on the same account and direction.
 */
function inMatchOrder<T extends { merchant: string }>(rows: T[]): T[] {
  return [...rows.filter((r) => r.merchant !== ''), ...rows.filter((r) => r.merchant === '')]
}

const UNIQUE_VIOLATION = 'P2002'
const FK_VIOLATION = 'P2003'
const NOT_FOUND = 'P2025'

const code = (err: unknown) => (err as { code?: string }).code

const toApi = (row: PrismaRow): TransferRule => ({
  id: row.id,
  account: row.accountId,
  type: row.type,
  merchant: row.merchant,
  counterAccount: row.counterAccountId,
})

const toData = (input: TransferRuleInput): Prisma.TransferRuleUncheckedCreateInput => ({
  accountId: input.account,
  type: input.type,
  merchant: input.merchant,
  counterAccountId: input.counterAccount,
})

const notFound = (id: number): Refusal => ({ refused: 'not found', error: `transfer rule ${id} not found` })

/** Maps a failed write to why it was refused, or null for an error that is not the caller's. */
function refusalOf(err: unknown, input: TransferRuleInput): Refusal | null {
  if (code(err) === UNIQUE_VIOLATION) {
    const where = input.merchant === '' ? 'any merchant' : `"${input.merchant}"`
    return { refused: 'conflict', error: `a ${input.type} rule for ${where} on "${input.account}" already exists` }
  }
  if (code(err) === FK_VIOLATION) {
    return { refused: 'invalid', error: `account "${input.account}" or "${input.counterAccount}" does not exist` }
  }
  return null
}

/** Every rule, in the order the import tries them. */
export async function listTransferRules(db: Db = prisma): Promise<TransferRule[]> {
  return inMatchOrder((await db.transferRule.findMany({ orderBy: { id: 'asc' } })).map(toApi))
}

/** Every rule for the import to tag transfers with. */
export async function loadTransferRules(db: Db = prisma): Promise<StoredTransferRule[]> {
  return (await listTransferRules(db)).map(({ id: _id, ...rule }) => rule)
}

/** Stores a rule. An account that isn't stored, or a second rule for the same account, direction and merchant, is refused. */
export async function createTransferRule(input: TransferRuleInput): Promise<TransferRule | Refusal> {
  try {
    return toApi(await prisma.transferRule.create({ data: toData(input) }))
  } catch (err) {
    const refusal = refusalOf(err, input)
    if (refusal) return refusal
    throw err
  }
}

/** Replaces a rule. Transfers already on the ledger keep their tag until the next import. */
export async function updateTransferRule(id: number, input: TransferRuleInput): Promise<TransferRule | Refusal> {
  try {
    return toApi(await prisma.transferRule.update({ where: { id }, data: toData(input) }))
  } catch (err) {
    if (code(err) === NOT_FOUND) return notFound(id)
    const refusal = refusalOf(err, input)
    if (refusal) return refusal
    throw err
  }
}

/** Deletes a rule. Its transfers lose their tag at the next import. */
export async function deleteTransferRule(id: number): Promise<Refusal | null> {
  try {
    await prisma.transferRule.delete({ where: { id } })
    return null
  } catch (err) {
    if (code(err) === NOT_FOUND) return notFound(id)
    throw err
  }
}
