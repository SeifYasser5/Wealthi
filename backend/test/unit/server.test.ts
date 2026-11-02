import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

// server.ts has no exports: importing it binds the app (after the demo seed, in
// demo mode). All are mocked, so this checks only the startup wiring.

const mocks = vi.hoisted(() => ({
  listen: vi.fn((_port: number, _host: string, onListening: () => void) => onListening()),
  importFromChatDb: vi.fn(),
  seedDemo: vi.fn(),
  seedSettings: vi.fn(),
  seedCategories: vi.fn(),
  seedSchedules: vi.fn(),
}))
vi.mock('dotenv/config', () => ({}))
vi.mock('../../src/app', () => ({ default: { listen: mocks.listen } }))
vi.mock('../../src/services/importer', () => ({ importFromChatDb: mocks.importFromChatDb }))
vi.mock('../../src/demo/seed', () => ({ seedDemo: mocks.seedDemo }))
vi.mock('../../src/db/settings', () => ({ seedSettings: mocks.seedSettings }))
vi.mock('../../src/db/categories', () => ({ seedCategories: mocks.seedCategories }))
vi.mock('../../src/db/schedules', () => ({ seedSchedules: mocks.seedSchedules }))

let log: MockInstance<typeof console.log>
let error: MockInstance<typeof console.error>

beforeEach(() => {
  vi.resetModules()
  mocks.listen.mockClear()
  mocks.importFromChatDb.mockReset()
  mocks.seedDemo.mockReset()
  mocks.seedSettings.mockReset().mockResolvedValue(0)
  mocks.seedCategories.mockReset().mockResolvedValue(0)
  mocks.seedSchedules.mockReset().mockResolvedValue(0)
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
  await new Promise((r) => setTimeout(r, 0))
}

async function startDemo(env: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries({ WEALTHI_DEMO: 'true', ...env })) vi.stubEnv(k, v)
  await import('../../src/server')
  await vi.waitFor(() => expect(mocks.seedDemo).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 0))
}

const logged = () => log.mock.calls.map((c) => c.join(' ')).join('\n')

describe('server startup', () => {
  it('binds loopback on 3000 by default', async () => {
    await start({ PORT: undefined, HOST: undefined })
    expect(mocks.listen).toHaveBeenCalledWith(3000, '127.0.0.1', expect.any(Function))
    expect(logged()).toContain('Server running on http://127.0.0.1:3000')
  })

  it('honours PORT and HOST', async () => {
    await start({ PORT: '4100', HOST: '0.0.0.0' })
    expect(mocks.listen).toHaveBeenCalledWith(4100, '0.0.0.0', expect.any(Function))
  })

  it('never imports on start, even with a chat.db present: that is POST /api/import', async () => {
    await start({ IMESSAGE_DB_PATH: __filename })
    expect(mocks.importFromChatDb).not.toHaveBeenCalled()
    expect(mocks.seedDemo).not.toHaveBeenCalled()
  })
})

describe('settings seed on startup', () => {
  it('seeds accounts, sources, transfer rules and senders first, before listening', async () => {
    mocks.seedSettings.mockImplementation(async () => {
      expect(mocks.seedCategories).not.toHaveBeenCalled()
      expect(mocks.listen).not.toHaveBeenCalled()
      return 11
    })
    await start({})
    expect(mocks.seedSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        bankSenders: ['Test Bank'],
        accounts: expect.arrayContaining([expect.objectContaining({ id: 'checking' })]),
      }),
    )
    expect(logged()).toContain('Seeded 11 account, source, transfer rule and sender rows from config.')
  })

  it('still seeds the categories when the settings seed fails, reporting why', async () => {
    mocks.seedSettings.mockRejectedValue(new Error('ECONNREFUSED'))
    await start({})
    expect(error).toHaveBeenCalledWith('Settings seed failed:', 'ECONNREFUSED')
    expect(mocks.seedCategories).toHaveBeenCalled()
  })

  it('reports a non-Error seed failure as-is', async () => {
    mocks.seedSettings.mockRejectedValue('weird')
    await start({})
    expect(error).toHaveBeenCalledWith('Settings seed failed:', 'weird')
  })
})

describe('category seed on startup', () => {
  it('seeds from config before listening, and says how many', async () => {
    mocks.seedCategories.mockImplementation(async () => {
      expect(mocks.listen).not.toHaveBeenCalled()
      return 3
    })
    await start({})
    expect(mocks.seedCategories).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantCategories: { 'ACME GROCERS': 'Groceries' },
        extraCategories: ['Rent', 'Dining'],
      }),
    )
    expect(logged()).toContain('Seeded 3 categories from config.')
  })

  it('says nothing when categories were already stored', async () => {
    await start({})
    expect(logged()).not.toContain('Seeded')
  })

  it('still listens when the seed fails, reporting why', async () => {
    mocks.seedCategories.mockRejectedValue(new Error('ECONNREFUSED'))
    await start({})
    expect(error).toHaveBeenCalledWith('Category seed failed:', 'ECONNREFUSED')
  })

  it('reports a non-Error seed failure as-is', async () => {
    mocks.seedCategories.mockRejectedValue('weird')
    await start({})
    expect(error).toHaveBeenCalledWith('Category seed failed:', 'weird')
  })
})

describe('schedule seed on startup', () => {
  it('seeds config’s recurringTransactions after the categories, before listening', async () => {
    mocks.seedSchedules.mockImplementation(async () => {
      expect(mocks.seedCategories).toHaveBeenCalled()
      expect(mocks.listen).not.toHaveBeenCalled()
      return 2
    })
    await start({})
    expect(mocks.seedSchedules).toHaveBeenCalledWith([])
    expect(logged()).toContain('Seeded 2 schedules from config.')
  })

  it('still seeds the schedules when the category seed fails', async () => {
    mocks.seedCategories.mockRejectedValue(new Error('ECONNREFUSED'))
    await start({})
    expect(mocks.seedSchedules).toHaveBeenCalled()
  })

  it('still listens when the schedule seed fails, reporting why', async () => {
    mocks.seedSchedules.mockRejectedValue(new Error('ECONNREFUSED'))
    await start({})
    expect(error).toHaveBeenCalledWith('Schedule seed failed:', 'ECONNREFUSED')
  })

  it('reports a non-Error schedule seed failure as-is', async () => {
    mocks.seedSchedules.mockRejectedValue('weird')
    await start({})
    expect(error).toHaveBeenCalledWith('Schedule seed failed:', 'weird')
  })
})

describe('server startup in demo mode', () => {
  it('seeds the demo ledger, then listens, and never reads chat.db', async () => {
    mocks.seedDemo.mockImplementation(async () => {
      expect(mocks.listen).not.toHaveBeenCalled()
      return { months: 6, totalStored: 230, errors: [] }
    })
    await startDemo({ IMESSAGE_DB_PATH: __filename, HOST: '0.0.0.0', PORT: '8080' })
    expect(mocks.listen).toHaveBeenCalledWith(8080, '0.0.0.0', expect.any(Function))
    expect(mocks.importFromChatDb).not.toHaveBeenCalled()
    // seedDemo replaces the settings, categories and schedules itself.
    expect(mocks.seedSettings).not.toHaveBeenCalled()
    expect(mocks.seedCategories).not.toHaveBeenCalled()
    expect(mocks.seedSchedules).not.toHaveBeenCalled()
    expect(logged()).toContain('[demo] Seeded 230 transactions over 6 months, 0 parse errors.')
  })

  it('exits without listening when the seed fails', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    mocks.seedDemo.mockRejectedValue(new Error('refusing to seed'))
    await startDemo()
    expect(error).toHaveBeenCalledWith('[demo] Seed failed:', 'refusing to seed')
    expect(exit).toHaveBeenCalledWith(1)
    expect(mocks.listen).not.toHaveBeenCalled()
  })

  it('reports a non-Error seed failure as-is', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    mocks.seedDemo.mockRejectedValue('weird')
    await startDemo()
    expect(error).toHaveBeenCalledWith('[demo] Seed failed:', 'weird')
  })

  it('only switches on for WEALTHI_DEMO=true', async () => {
    await start({ WEALTHI_DEMO: '1' })
    expect(mocks.seedDemo).not.toHaveBeenCalled()
  })
})
