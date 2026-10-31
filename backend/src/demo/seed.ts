import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { countSmsRowsOutside } from '../db/transactions'
import { importFromChatDb } from '../services/importer'
import { PATTERNS_DIR } from '../services/patterns/store'
import { CONFIG_PATH } from '../utils/config'
import { MAC_EPOCH_OFFSET_MS } from '../utils/constants'
import type { ImportSummary } from '../utils/types'
import { DEMO_GUID_PREFIX, demoLedger, type DemoMessage } from './ledger'

/** backend/demo — the demo's committed config and pattern file. */
export const DEMO_DIR = resolve(__dirname, '../../demo')
export const DEMO_CONFIG_PATH = resolve(DEMO_DIR, 'wealthi.demo.json')
export const DEMO_PATTERNS_DIR = resolve(DEMO_DIR, 'patterns')

/**
 * Rebuilds the database as the demo ledger: writes the demo SMS to a
 * throwaway chat.db and runs the live importer over it, exactly as a real
 * import runs — so it also wipes `transactions` and `monthly_balances` first.
 *
 * Refuses unless the app was started on the demo config and patterns, and
 * unless every SMS row already stored is demo data: pointed at a real ledger by
 * mistake, it stops instead of replacing it.
 */
export async function seedDemo(now = new Date()): Promise<ImportSummary> {
  if (CONFIG_PATH !== DEMO_CONFIG_PATH || PATTERNS_DIR !== DEMO_PATTERNS_DIR) {
    throw new Error(
      `demo mode needs WEALTHI_CONFIG_PATH=${DEMO_CONFIG_PATH} and WEALTHI_PATTERNS_DIR=${DEMO_PATTERNS_DIR}`,
    )
  }
  const foreign = await countSmsRowsOutside(DEMO_GUID_PREFIX)
  if (foreign > 0) {
    throw new Error(`refusing to seed: the database holds ${foreign} transactions that are not demo data`)
  }

  const dir = mkdtempSync(join(tmpdir(), 'wealthi-demo-'))
  try {
    const path = join(dir, 'chat.db')
    writeChatDb(path, demoLedger(now))
    return await importFromChatDb(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** A chat.db with only the tables and columns services/ingest/reader.ts reads. */
function writeChatDb(path: string, messages: DemoMessage[]): void {
  const db = new Database(path)
  try {
    db.exec(`
      CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE);
      CREATE TABLE message (
        ROWID          INTEGER PRIMARY KEY AUTOINCREMENT,
        guid           TEXT NOT NULL UNIQUE,
        text           TEXT,
        handle_id      INTEGER NOT NULL,
        date           INTEGER,
        attributedBody BLOB
      );
    `)
    const insertHandle = db.prepare('INSERT OR IGNORE INTO handle (id) VALUES (?)')
    const handleId = db.prepare<[string], { ROWID: number }>('SELECT ROWID FROM handle WHERE id = ?')
    const insertMessage = db.prepare('INSERT INTO message (guid, text, handle_id, date) VALUES (?, ?, ?, ?)')
    db.transaction(() => {
      for (const m of messages) {
        insertHandle.run(m.sender)
        // chat.db dates are nanoseconds since 2001-01-01 UTC.
        const date = (BigInt(m.date.getTime()) - MAC_EPOCH_OFFSET_MS) * 1_000_000n
        insertMessage.run(m.guid, m.text, handleId.get(m.sender)!.ROWID, date)
      }
    })()
  } finally {
    db.close()
  }
}
