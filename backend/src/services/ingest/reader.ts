import Database from 'better-sqlite3'
import { DbRow } from '../../utils/types'

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const QUERY = `
  SELECT
    m.ROWID           AS rowid,
    m.guid            AS guid,
    m.date            AS message_date,
    m.text            AS text,
    h.id              AS sender,
    m.attributedBody  AS attributed_body
  FROM message m
  JOIN handle h ON m.handle_id = h.rowid
  WHERE h.id IN (SELECT value FROM json_each(?))
  ORDER BY m.date ASC
`

/**
 * Opens an iMessage chat.db (read-only) and returns all messages whose sender
 * ID exactly matches one of the entries in `senders`.
 *
 * @param dbPath     Absolute path to chat.db, e.g.
 *                   `${process.env.HOME}/Library/Messages/chat.db`
 * @param senders    List of sender IDs to fetch (values of handle.id in chat.db)
 * @param sinceRowid Optional incremental-import cursor — only messages whose
 *                   ROWID is strictly greater are returned. ROWID reflects
 *                   chat.db insertion order, so a late-delivered (back-dated)
 *                   message is still picked up because it gets a fresh ROWID.
 */
export function readMessages(dbPath: string, senders: string[], sinceRowid?: bigint): DbRow[] {
  const db = new Database(dbPath, { readonly: true })

  try {
    // Enable BigInt so oversized date values (and ROWID) are not silently truncated
    db.defaultSafeIntegers(true)

    let stmt = db.prepare<[string], DbRow>(QUERY)

    // Apply the cursor by augmenting the query when `sinceRowid` is provided.
    // We rebind rather than modify the constant QUERY so the default path stays
    // fast. The value is a plain integer, so inlining it is injection-safe.
    if (sinceRowid !== undefined) {
      const filteredQuery = QUERY.replace('ORDER BY', `AND m.ROWID > ${sinceRowid}\n  ORDER BY`)
      stmt = db.prepare<[string], DbRow>(filteredQuery)
    }

    return stmt.all(JSON.stringify(senders))
  } finally {
    db.close()
  }
}
