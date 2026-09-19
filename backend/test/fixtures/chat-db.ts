import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAC_EPOCH_OFFSET_MS } from '../../src/utils/constants'

/**
 * Builds a synthetic iMessage chat.db — only the tables and columns
 * services/ingest/reader.ts reads. Every message here is made up; never put
 * real SMS text, names or card digits in a fixture.
 */

export interface FixtureMessage {
  sender: string
  /** Wall-clock instant the message arrived */
  date: Date
  /** Stored in message.text. Omit and set `attributedBody` for text-less rows. */
  text?: string
  attributedBody?: Buffer
  guid?: string
}

/** A JS Date as chat.db stores it: nanoseconds since 2001-01-01 UTC. */
export function toMacDate(date: Date): bigint {
  return (BigInt(date.getTime()) - MAC_EPOCH_OFFSET_MS) * 1_000_000n
}

/**
 * The legacy "streamtyped" attributedBody encoding of `text`, shaped like the
 * blobs macOS writes: header, class chain, NSString, then 0x2B + length + UTF-8.
 */
export function streamtypedBody(text: string): Buffer {
  const utf8 = Buffer.from(text, 'utf8')
  let length: Buffer
  if (utf8.length < 0x81) length = Buffer.from([utf8.length])
  else if (utf8.length <= 0xffff) {
    length = Buffer.alloc(3)
    length[0] = 0x81
    length.writeUInt16LE(utf8.length, 1)
  } else {
    length = Buffer.alloc(5)
    length[0] = 0x82
    length.writeUInt32LE(utf8.length, 1)
  }
  return Buffer.concat([
    Buffer.from([0x04, 0x0b]),
    Buffer.from('streamtyped', 'latin1'),
    Buffer.from([0x81, 0xe8, 0x03, 0x84, 0x01, 0x40, 0x84, 0x84, 0x84, 0x12]),
    Buffer.from('NSAttributedString', 'latin1'),
    Buffer.from([0x00, 0x84, 0x84, 0x08]),
    Buffer.from('NSObject', 'latin1'),
    Buffer.from([0x00, 0x85, 0x92, 0x84, 0x84, 0x84, 0x08]),
    Buffer.from('NSString', 'latin1'),
    Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
    length,
    utf8,
    Buffer.from([0x86, 0x84, 0x02, 0x69, 0x49, 0x01]),
  ])
}

/** Writes `messages` to a fresh chat.db in a temp dir. Call `cleanup()` when done. */
export function buildChatDb(messages: FixtureMessage[]): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'wealthi-chatdb-'))
  const path = join(dir, 'chat.db')
  const db = new Database(path)
  try {
    db.exec(`
      CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE);
      CREATE TABLE message (
        ROWID          INTEGER PRIMARY KEY AUTOINCREMENT,
        guid           TEXT NOT NULL UNIQUE,
        text           TEXT,
        handle_id      INTEGER NOT NULL DEFAULT 0,
        date           INTEGER,
        attributedBody BLOB
      );
    `)
  } finally {
    db.close()
  }
  appendMessages(path, messages)
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/**
 * Adds messages to an existing fixture chat.db, as new messages arriving later
 * would: each gets the next ROWID. Default guids continue from the row count.
 */
export function appendMessages(path: string, messages: FixtureMessage[]): void {
  const db = new Database(path)
  try {
    const insertHandle = db.prepare('INSERT OR IGNORE INTO handle (id) VALUES (?)')
    const handleId = db.prepare<[string], { ROWID: number }>('SELECT ROWID FROM handle WHERE id = ?')
    const insertMessage = db.prepare(
      'INSERT INTO message (guid, text, handle_id, date, attributedBody) VALUES (?, ?, ?, ?, ?)',
    )
    const existing = (db.prepare('SELECT COUNT(*) AS n FROM message').get() as { n: number }).n

    db.transaction(() => {
      messages.forEach((m, i) => {
        insertHandle.run(m.sender)
        const handle = handleId.get(m.sender)!.ROWID
        const guid = m.guid ?? `fixture-${String(existing + i + 1).padStart(4, '0')}`
        insertMessage.run(guid, m.text ?? null, handle, toMacDate(m.date), m.attributedBody ?? null)
      })
    })()
  } finally {
    db.close()
  }
}
