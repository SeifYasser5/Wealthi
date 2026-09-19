import { prisma } from '../../src/db/client'

/** Empties every table. Only ever reaches a *_test database (see setup/guard.ts). */
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.monthlyBalance.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.importState.deleteMany(),
  ])
}
