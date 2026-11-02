import { prisma } from './client'
import type { Prisma } from '@prisma/client'
import type { Refusal } from '../utils/types'

type Db = Prisma.TransactionClient

/** Every sender SMS are read from, by name. */
export async function listBankSenders(db: Db = prisma): Promise<string[]> {
  return (await db.bankSender.findMany({ orderBy: { sender: 'asc' } })).map((r) => r.sender)
}

/** Adds a sender. One already stored is refused. */
export async function addBankSender(sender: string): Promise<Refusal | null> {
  const { count } = await prisma.bankSender.createMany({ data: [{ sender }], skipDuplicates: true })
  return count === 0 ? { refused: 'conflict', error: `sender "${sender}" already exists` } : null
}

/** Removes a sender; its messages are no longer imported or learned from. */
export async function deleteBankSender(sender: string): Promise<Refusal | null> {
  const { count } = await prisma.bankSender.deleteMany({ where: { sender } })
  return count === 0 ? { refused: 'not found', error: `sender "${sender}" not found` } : null
}
