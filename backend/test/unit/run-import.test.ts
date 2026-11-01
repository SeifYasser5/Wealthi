import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ParseError } from '../../src/services/ingest/parser'
import { chatDbPath, runImport } from '../../src/services/run-import'
import type { ImportError, ImportSummary } from '../../src/utils/types'

// The import run behind POST /api/import, with the importer and the demo seed
// mocked: the report it builds, the one-at-a-time guard and demo mode. The real
// import over a fixture chat.db is in integration/api.test.ts.

const mocks = vi.hoisted(() => ({ importFromChatDb: vi.fn(), seedDemo: vi.fn() }))
vi.mock('../../src/services/importer', () => ({ importFromChatDb: mocks.importFromChatDb }))
vi.mock('../../src/demo/seed', () => ({ seedDemo: mocks.seedDemo }))

// Any file that exists stands in for chat.db: the importer that would read it is mocked.
const CHAT_DB = __filename
const MISSING = join(__dirname, 'no-such-chat.db')

let log: MockInstance<typeof console.log>
let error: MockInstance<typeof console.error>

beforeEach(() => {
  mocks.importFromChatDb.mockReset()
  mocks.seedDemo.mockReset()
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('IMESSAGE_DB_PATH', CHAT_DB)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const logged = () => log.mock.calls.map((c) => c.join(' ')).join('\n')

function parseFailure(text: string, cause: unknown): ImportError {
  const decoded = { rowid: 1n, guid: 'g-1', messageDate: new Date('2026-01-05T09:30:00Z'), text, sender: 'Test Bank' }
  return { stage: 'parse', decoded, cause }
}

/** A promise you resolve or reject from the outside, to hold an import open. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('chatDbPath', () => {
  it('is data/chat.db under the working directory unless IMESSAGE_DB_PATH says otherwise', () => {
    vi.stubEnv('IMESSAGE_DB_PATH', undefined)
    expect(chatDbPath()).toBe(join(process.cwd(), 'data', 'chat.db'))
    vi.stubEnv('IMESSAGE_DB_PATH', '/somewhere/chat.db')
    expect(chatDbPath()).toBe('/somewhere/chat.db')
  })
})

describe('runImport', () => {
  it('skips, leaving the ledger alone, when there is no chat.db', async () => {
    vi.stubEnv('IMESSAGE_DB_PATH', MISSING)
    const report = await runImport()
    expect(report).toMatchObject({ status: 'skipped', source: MISSING, months: 0, totalStored: 0, parseErrors: [] })
    expect(mocks.importFromChatDb).not.toHaveBeenCalled()
    expect(logged()).toContain(`No chat.db found at ${MISSING}`)
  })

  it('imports chat.db and reports the summary, timed', async () => {
    mocks.importFromChatDb.mockResolvedValue({ months: 2, totalStored: 7, errors: [] } satisfies ImportSummary)
    const before = Date.now()
    const report = await runImport()

    expect(mocks.importFromChatDb).toHaveBeenCalledWith(CHAT_DB)
    expect(report).toMatchObject({ status: 'completed', source: CHAT_DB, months: 2, totalStored: 7, parseErrors: [] })
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
    expect(Date.parse(report.finishedAt)).toBeGreaterThanOrEqual(before)
    expect(logged()).toContain('[import] Done: 2 months, 7 transactions stored, 0 parse errors.')
  })

  it('reports each parse error with its sender, date, cleaned text and reason', async () => {
    const errors = [
      parseFailure(
        'PAID 10.00​ AT SHOP',
        new ParseError('patterns', 'PAID 10.00 AT SHOP', 'no enabled pattern matched'),
      ),
      parseFailure('ODD', new Error('bad amount')),
      parseFailure('WEIRD', 'not an error'),
    ]
    mocks.importFromChatDb.mockResolvedValue({ months: 1, totalStored: 3, errors } satisfies ImportSummary)

    const { parseErrors } = await runImport()
    expect(parseErrors).toEqual([
      {
        sender: 'Test Bank',
        messageDate: '2026-01-05T09:30:00.000Z',
        text: 'PAID 10.00 AT SHOP',
        reason: 'no enabled pattern matched',
      },
      expect.objectContaining({ text: 'ODD', reason: 'bad amount' }),
      expect.objectContaining({ text: 'WEIRD', reason: 'not an error' }),
    ])
  })

  it('falls back to the ParseError message when it has no string cause', async () => {
    const cause = new ParseError('patterns', 'RAW TEXT', new Error('inner'))
    mocks.importFromChatDb.mockResolvedValue({ months: 1, totalStored: 0, errors: [parseFailure('RAW TEXT', cause)] })
    const { parseErrors } = await runImport()
    expect(parseErrors[0].reason).toBe(cause.message)
  })

  it('joins an import already running instead of starting a second one', async () => {
    const held = deferred<ImportSummary>()
    mocks.importFromChatDb.mockReturnValue(held.promise)

    const first = runImport()
    const second = runImport()
    held.resolve({ months: 1, totalStored: 4, errors: [] })

    expect(await second).toBe(await first)
    expect(mocks.importFromChatDb).toHaveBeenCalledTimes(1)
  })

  it('runs again once the previous import has finished', async () => {
    mocks.importFromChatDb.mockResolvedValue({ months: 1, totalStored: 4, errors: [] })
    await runImport()
    await runImport()
    expect(mocks.importFromChatDb).toHaveBeenCalledTimes(2)
  })

  it('rejects with the importer error, logs it, and lets the next call run', async () => {
    mocks.importFromChatDb.mockRejectedValueOnce(new Error('db down'))
    await expect(runImport()).rejects.toThrow('db down')
    expect(error).toHaveBeenCalledWith('[import] Failed:', 'db down')

    mocks.importFromChatDb.mockResolvedValueOnce({ months: 1, totalStored: 1, errors: [] })
    await expect(runImport()).resolves.toMatchObject({ status: 'completed' })
  })

  it('logs a non-Error failure as-is', async () => {
    mocks.importFromChatDb.mockRejectedValue('weird')
    await expect(runImport()).rejects.toBe('weird')
    expect(error).toHaveBeenCalledWith('[import] Failed:', 'weird')
  })

  it('rebuilds the demo ledger in demo mode, never looking for chat.db', async () => {
    vi.stubEnv('WEALTHI_DEMO', 'true')
    vi.stubEnv('IMESSAGE_DB_PATH', MISSING)
    mocks.seedDemo.mockResolvedValue({ months: 6, totalStored: 230, errors: [] })

    const report = await runImport()
    expect(report).toMatchObject({ status: 'completed', source: 'demo ledger', months: 6, totalStored: 230 })
    expect(mocks.importFromChatDb).not.toHaveBeenCalled()
  })
})
