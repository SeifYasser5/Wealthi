import { afterAll, describe, expect, it } from 'vitest'
import { readMessages } from '../../src/services/ingest/reader'
import { buildChatDb, streamtypedBody, toMacDate } from '../fixtures/chat-db'
import { at } from '../fixtures/messages'

describe('readMessages', () => {
  const chatDb = buildChatDb([
    { sender: 'Bank', date: at('2026-01-03'), text: 'third by date' },
    { sender: 'Other', date: at('2026-01-01'), text: 'not a bank' },
    { sender: 'Bank', date: at('2026-01-01'), text: 'first by date' },
    { sender: 'Bank', date: at('2026-01-01'), attributedBody: streamtypedBody('same date, later rowid') },
    { sender: 'Bank2', date: at('2026-01-02'), text: 'second bank' },
  ])
  afterAll(() => chatDb.cleanup())

  it('returns only the given senders, ordered by date then rowid', () => {
    const rows = readMessages(chatDb.path, ['Bank', 'Bank2'])
    expect(rows.map((r) => [r.rowid, r.sender, r.text])).toEqual([
      [3n, 'Bank', 'first by date'],
      [4n, 'Bank', null],
      [5n, 'Bank2', 'second bank'],
      [1n, 'Bank', 'third by date'],
    ])
  })

  it('returns the raw columns with 64-bit values as bigint', () => {
    const [row] = readMessages(chatDb.path, ['Bank'])
    expect(row).toEqual({
      rowid: 3n,
      guid: 'fixture-0003',
      message_date: toMacDate(at('2026-01-01')),
      text: 'first by date',
      sender: 'Bank',
      attributed_body: null,
    })
    expect(Buffer.isBuffer(readMessages(chatDb.path, ['Bank'])[1].attributed_body)).toBe(true)
  })

  it('reads only rows after the cursor', () => {
    expect(readMessages(chatDb.path, ['Bank', 'Bank2'], 3n).map((r) => r.rowid)).toEqual([4n, 5n])
    expect(readMessages(chatDb.path, ['Bank'], 5n)).toEqual([])
  })

  it('returns nothing for no senders', () => {
    expect(readMessages(chatDb.path, [])).toEqual([])
  })

  it('opens the database read-only', () => {
    expect(() => readMessages('/nonexistent/chat.db', ['Bank'])).toThrow()
  })
})
