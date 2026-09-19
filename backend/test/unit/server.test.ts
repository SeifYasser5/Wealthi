import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

// server.ts has no exports: importing it binds the app and kicks off the
// import. Both are mocked, so this checks only the startup wiring.

const mocks = vi.hoisted(() => ({
  listen: vi.fn((_port: number, _host: string, onListening: () => void) => onListening()),
  importFromChatDb: vi.fn(),
}))
vi.mock('dotenv/config', () => ({}))
vi.mock('../../src/app', () => ({ default: { listen: mocks.listen } }))
vi.mock('../../src/services/importer', () => ({ importFromChatDb: mocks.importFromChatDb }))

const dir = mkdtempSync(join(tmpdir(), 'wealthi-server-'))
const chatDb = join(dir, 'chat.db')
writeFileSync(chatDb, '')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let log: MockInstance<typeof console.log>
let error: MockInstance<typeof console.error>

beforeEach(() => {
  vi.resetModules()
  mocks.listen.mockClear()
  mocks.importFromChatDb.mockReset()
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function start(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  await import('../../src/server')
  await vi.waitFor(() => expect(mocks.listen).toHaveBeenCalled())
  // Let the import promise chain settle.
  await new Promise((r) => setTimeout(r, 0))
}

const logged = () => log.mock.calls.map((c) => c.join(' ')).join('\n')

describe('server startup', () => {
  it('binds loopback on 3000 by default', async () => {
    await start({ PORT: undefined, HOST: undefined, IMESSAGE_DB_PATH: join(dir, 'missing.db') })
    expect(mocks.listen).toHaveBeenCalledWith(3000, '127.0.0.1', expect.any(Function))
    expect(logged()).toContain('Server running on http://127.0.0.1:3000')
  })

  it('honours PORT and HOST', async () => {
    await start({ PORT: '4100', HOST: '0.0.0.0', IMESSAGE_DB_PATH: join(dir, 'missing.db') })
    expect(mocks.listen).toHaveBeenCalledWith(4100, '0.0.0.0', expect.any(Function))
  })

  it('skips the import when there is no chat.db', async () => {
    await start({ IMESSAGE_DB_PATH: join(dir, 'missing.db') })
    expect(mocks.importFromChatDb).not.toHaveBeenCalled()
    expect(logged()).toContain('skipping auto-import')
  })

  it('looks for data/chat.db under the working directory by default', async () => {
    // Whether or not that file exists here, the (mocked) import must not care.
    mocks.importFromChatDb.mockResolvedValue({ months: 0, totalStored: 0, errors: [] })
    await start({ IMESSAGE_DB_PATH: undefined })
    expect(logged()).toContain(join(process.cwd(), 'data', 'chat.db'))
  })

  it('imports on start and reports the summary', async () => {
    mocks.importFromChatDb.mockResolvedValue({ months: 2, totalStored: 7, errors: [{}, {}] })
    await start({ IMESSAGE_DB_PATH: chatDb })
    expect(mocks.importFromChatDb).toHaveBeenCalledWith(chatDb)
    expect(logged()).toContain('[import] Done: 2 months, 7 transactions stored, 2 parse errors.')
  })

  it('keeps serving when the import fails', async () => {
    mocks.importFromChatDb.mockRejectedValue(new Error('db down'))
    await start({ IMESSAGE_DB_PATH: chatDb })
    expect(error).toHaveBeenCalledWith('[import] Failed:', 'db down')
  })

  it('reports a non-Error rejection as-is', async () => {
    mocks.importFromChatDb.mockRejectedValue('weird')
    await start({ IMESSAGE_DB_PATH: chatDb })
    expect(error).toHaveBeenCalledWith('[import] Failed:', 'weird')
  })
})
