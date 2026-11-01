import request from 'supertest'
import type { LearnResponse, PatternRow, PatternsResponse } from '@wealthi/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../../src/app'
import { prisma } from '../../src/db/client'
import { importFromChatDb } from '../../src/services/importer'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { resetDatabase } from '../setup/reset'

/**
 * The Learn page's API over real Postgres: learn from a fixture chat.db, review
 * what it found, toggle patterns — and the import parsing with what the table
 * holds. resetDatabase() stores the fixture patterns, whose ids are hand-written,
 * so every pattern learned from the ledger is new to it.
 */

const chatDb = buildChatDb(LEDGER)

beforeEach(async () => {
  await resetDatabase()
  vi.stubEnv('IMESSAGE_DB_PATH', chatDb.path)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
afterAll(async () => {
  chatDb.cleanup()
  await resetDatabase()
  await prisma.$disconnect()
})

const patterns = async (): Promise<PatternRow[]> =>
  ((await request(app).get('/api/patterns').expect(200)).body as PatternsResponse).patterns
const learn = async (): Promise<LearnResponse> =>
  (await request(app).post('/api/patterns/learn').expect(200)).body as LearnResponse
const byStatus = (rows: PatternRow[], status: PatternRow['status']) => rows.filter((p) => p.status === status)

describe('GET /api/patterns', () => {
  it('lists the stored patterns with their status, most-used first', async () => {
    const rows = await patterns()
    expect(rows.map((p) => [p.id, p.status])).toEqual(
      expect.arrayContaining([
        ['test-bank:card-charge', 'enabled'],
        ['test-bank:disabled', 'disabled'],
      ]),
    )
    expect(rows[0]).toMatchObject({ bank: 'test-bank', review: [], missing: false })
    expect(Date.parse(rows[0].learnedAt)).not.toBeNaN()
  })
})

describe('POST /api/patterns/learn', () => {
  it('stores what it found as pending and reports it', async () => {
    const report = await learn()
    const pending = byStatus(await patterns(), 'pending')

    expect(report).toMatchObject({
      status: 'completed',
      source: chatDb.path,
      messages: LEDGER.filter((m) => m.sender === 'Test Bank').length,
      undecodable: 0,
    })
    expect(report.added).toBeGreaterThan(0)
    expect(pending).toHaveLength(report.added)
    expect(pending.every((p) => p.bank === 'test-bank' && p.messages > 0 && !p.missing)).toBe(true)
  })

  it('keeps what you reviewed, and marks a stored pattern it no longer finds missing', async () => {
    await learn()
    const fixture = (await patterns()).filter((p) => !p.id.match(/:[0-9a-f]{10}/))
    expect(fixture.length).toBeGreaterThan(0)
    for (const p of fixture) expect(p).toMatchObject({ missing: true, messages: 0 })
    expect(fixture.find((p) => p.id === 'test-bank:card-charge')?.status).toBe('enabled')
  })

  it('finds nothing new the second time, and leaves an unreviewed pattern pending', async () => {
    const first = await learn()
    const second = await learn()
    expect(second.added).toBe(0)
    expect(byStatus(await patterns(), 'pending')).toHaveLength(first.added)
  })

  it('refreshes the counts of a stored pattern but never its status or text', async () => {
    await learn()
    const [p] = byStatus(await patterns(), 'pending')
    await prisma.smsPattern.update({
      where: { id: p.id },
      data: { status: 'enabled', pattern: `${p.pattern} `, messages: 0, missing: true },
    })

    expect((await learn()).added).toBe(0)
    const after = await prisma.smsPattern.findUniqueOrThrow({ where: { id: p.id } })
    expect(after).toMatchObject({ status: 'enabled', pattern: `${p.pattern} `, generated: p.pattern })
    expect(after).toMatchObject({ messages: p.messages, missing: false })
  })

  it('skips, storing nothing, when there is no chat.db', async () => {
    vi.stubEnv('IMESSAGE_DB_PATH', '/nonexistent/chat.db')
    expect(await learn()).toMatchObject({ status: 'skipped', added: 0 })
    expect(byStatus(await patterns(), 'pending')).toEqual([])
  })
})

describe('PATCH /api/patterns', () => {
  it('confirms a review: the selected ones enabled, the rest disabled', async () => {
    await learn()
    const [first, ...rest] = byStatus(await patterns(), 'pending').map((p) => p.id)

    const res = await request(app)
      .patch('/api/patterns')
      .send({ enable: [first], disable: rest })
      .expect(200)
    const rows = (res.body as PatternsResponse).patterns
    expect(rows.find((p) => p.id === first)?.status).toBe('enabled')
    expect(rest.every((id) => rows.find((p) => p.id === id)?.status === 'disabled')).toBe(true)
    expect(byStatus(rows, 'pending')).toEqual([])

    // Reviewed is not new: the next run shows nothing to review.
    expect((await learn()).added).toBe(0)
    expect(byStatus(await patterns(), 'pending')).toEqual([])
  })

  it('toggles one pattern either way', async () => {
    await request(app)
      .patch('/api/patterns')
      .send({ disable: ['test-bank:card-charge'] })
      .expect(200)
    expect((await prisma.smsPattern.findUniqueOrThrow({ where: { id: 'test-bank:card-charge' } })).status).toBe(
      'disabled',
    )
    await request(app)
      .patch('/api/patterns')
      .send({ enable: ['test-bank:card-charge'] })
      .expect(200)
    expect((await prisma.smsPattern.findUniqueOrThrow({ where: { id: 'test-bank:card-charge' } })).status).toBe(
      'enabled',
    )
  })

  it('changes nothing when one id is unknown', async () => {
    await request(app)
      .patch('/api/patterns')
      .send({ disable: ['test-bank:card-charge', 'test-bank:nope'] })
      .expect(404, { error: 'unknown pattern ids: test-bank:nope' })
    expect((await prisma.smsPattern.findUniqueOrThrow({ where: { id: 'test-bank:card-charge' } })).status).toBe(
      'enabled',
    )
  })
})

describe('the import parses with the stored patterns', () => {
  it('stops parsing a template once its pattern is disabled, with no restart', async () => {
    const before = await importFromChatDb(chatDb.path)
    expect(await prisma.transaction.count({ where: { merchant: 'ACME GROCERS' } })).toBeGreaterThan(0)

    await request(app)
      .patch('/api/patterns')
      .send({ disable: ['test-bank:card-charge'] })
      .expect(200)
    const after = await importFromChatDb(chatDb.path)

    expect(await prisma.transaction.count({ where: { merchant: 'ACME GROCERS' } })).toBe(0)
    expect(after.totalStored).toBeLessThan(before.totalStored)
    expect(after.errors.length).toBeGreaterThan(before.errors.length)
  })
})
