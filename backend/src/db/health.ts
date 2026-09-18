import { prisma } from './client'

/** Whether Postgres answers a trivial query. Never throws. */
export async function isDbConnected(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
