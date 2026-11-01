import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { runLearn } from '../../src/services/run-learn'
import type { LearnSummary } from '../../src/services/learn-patterns'

// The learn run behind POST /api/patterns/learn, with the learner and the demo
// chat.db mocked: the report it builds, the one-at-a-time guard and demo mode.
// A real run over a fixture chat.db is in integration/patterns.test.ts.

const mocks = vi.hoisted(() => ({ learnFromChatDb: vi.fn(), withDemoChatDb: vi.fn() }))
vi.mock('../../src/services/learn-patterns', () => ({ learnFromChatDb: mocks.learnFromChatDb }))
vi.mock('../../src/demo/seed', () => ({ withDemoChatDb: mocks.withDemoChatDb }))

// Any file that exists stands in for chat.db: the learner that would read it is mocked.
const CHAT_DB = __filename
const MISSING = join(__dirname, 'no-such-chat.db')
const SUMMARY: LearnSummary = { messages: 40, undecodable: 2, added: 3 }

let log: MockInstance<typeof console.log>
let error: MockInstance<typeof console.error>

beforeEach(() => {
  mocks.learnFromChatDb.mockReset()
  mocks.withDemoChatDb.mockReset()
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('IMESSAGE_DB_PATH', CHAT_DB)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const logged = () => log.mock.calls.map((c) => c.join(' ')).join('\n')

describe('runLearn', () => {
  it('skips, storing nothing, when there is no chat.db', async () => {
    vi.stubEnv('IMESSAGE_DB_PATH', MISSING)
    const report = await runLearn()
    expect(report).toMatchObject({ status: 'skipped', source: MISSING, messages: 0, undecodable: 0, added: 0 })
    expect(mocks.learnFromChatDb).not.toHaveBeenCalled()
    expect(logged()).toContain(`No chat.db found at ${MISSING}`)
  })

  it('learns from chat.db and reports the summary, timed', async () => {
    mocks.learnFromChatDb.mockResolvedValue(SUMMARY)
    const before = Date.now()
    const report = await runLearn()

    expect(mocks.learnFromChatDb).toHaveBeenCalledWith(CHAT_DB)
    expect(report).toMatchObject({ status: 'completed', source: CHAT_DB, ...SUMMARY })
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
    expect(Date.parse(report.finishedAt)).toBeGreaterThanOrEqual(before)
    expect(logged()).toContain('[learn] Done: 40 messages, 3 new patterns, 2 undecodable.')
  })

  it('joins a run already in progress instead of starting a second one', async () => {
    let finish!: (s: LearnSummary) => void
    mocks.learnFromChatDb.mockReturnValue(new Promise<LearnSummary>((r) => (finish = r)))

    const first = runLearn()
    const second = runLearn()
    finish(SUMMARY)

    expect(await second).toBe(await first)
    expect(mocks.learnFromChatDb).toHaveBeenCalledTimes(1)
  })

  it('rejects with the learner error, logs it, and lets the next call run', async () => {
    mocks.learnFromChatDb.mockRejectedValueOnce(new Error('db down'))
    await expect(runLearn()).rejects.toThrow('db down')
    expect(error).toHaveBeenCalledWith('[learn] Failed:', 'db down')

    mocks.learnFromChatDb.mockResolvedValueOnce(SUMMARY)
    await expect(runLearn()).resolves.toMatchObject({ status: 'completed' })
  })

  it('logs a non-Error failure as-is', async () => {
    mocks.learnFromChatDb.mockRejectedValue('weird')
    await expect(runLearn()).rejects.toBe('weird')
    expect(error).toHaveBeenCalledWith('[learn] Failed:', 'weird')
  })

  it('learns from the demo ledger in demo mode, never looking for chat.db', async () => {
    vi.stubEnv('WEALTHI_DEMO', 'true')
    vi.stubEnv('IMESSAGE_DB_PATH', MISSING)
    mocks.withDemoChatDb.mockImplementation((_now: Date, use: (path: string) => Promise<LearnSummary>) =>
      use('/tmp/demo/chat.db'),
    )
    mocks.learnFromChatDb.mockResolvedValue({ ...SUMMARY, added: 0 })

    const report = await runLearn()
    expect(report).toMatchObject({ status: 'completed', source: 'demo ledger', added: 0 })
    expect(mocks.learnFromChatDb).toHaveBeenCalledWith('/tmp/demo/chat.db')
  })
})
