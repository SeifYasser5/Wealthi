import { prisma } from './client'
import type { Prisma } from '@prisma/client'

type Db = Prisma.TransactionClient

// The watermark is a single row. We pin it to a fixed id so get/set always
// address the same record regardless of how many imports have run.
const CURSOR_ID = 1

/**
 * The highest chat.db message.ROWID scanned by a previous import, or null on a
 * first-ever run (no row yet) — in which case the caller reads every message.
 */
export async function getImportCursor(db: Db = prisma): Promise<bigint | undefined> {
  const row = await db.importState.findUnique({
    where: { id: CURSOR_ID },
    select: { lastRowid: true },
  })
  return row?.lastRowid ?? undefined
}

/**
 * Advances (or initialises) the watermark to `lastRowid`. Pass the surrounding
 * transaction client so the cursor moves atomically with the inserts it covers:
 * a rolled-back import leaves the cursor untouched and the run simply repeats.
 */
export async function setImportCursor(lastRowid: bigint, db: Db = prisma): Promise<void> {
  await db.importState.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, lastRowid },
    update: { lastRowid },
  })
}
