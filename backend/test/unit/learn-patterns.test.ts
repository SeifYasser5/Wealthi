import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { PatternFile } from '../../src/services/patterns/pattern'
import { buildChatDb, type FixtureMessage } from '../fixtures/chat-db'
import { at } from '../fixtures/messages'

// The `npm run patterns:learn` CLI end to end: fixture chat.db in, pattern file
// out. It runs on import, so each run re-imports it with fresh modules.

const MERCHANTS = ['ACME', 'CITY CAFE', 'BOOK NOOK', 'FUEL 12', 'PHARMACY PLUS']
const messages: FixtureMessage[] = [
  ...MERCHANTS.map((m, i) => ({
    sender: 'Test Bank',
    date: at(`2026-01-0${i + 1}`),
    text: `Your card ending *2222 was charged EGP ${i + 1}.00 at ${m}. Available balance EGP ${900 - i}.00`,
  })),
  { sender: 'Test Bank', date: at('2026-01-09'), text: 'Your one-time password is 482913.' },
  { sender: 'Test Bank', date: at('2026-01-10') }, // no text, no attributedBody
  { sender: '+15550000000', date: at('2026-01-11'), text: 'Card *1 charged EGP 1.00 at NOT A BANK' },
]

const chatDb = buildChatDb(messages)
const out = mkdtempSync(join(tmpdir(), 'wealthi-learn-'))
afterAll(() => {
  chatDb.cleanup()
  rmSync(out, { recursive: true, force: true })
})

let log: MockInstance<typeof console.log>
beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubEnv('IMESSAGE_DB_PATH', chatDb.path)
  vi.stubEnv('WEALTHI_PATTERNS_DIR', out)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.doUnmock('../../src/services/ingest/decode')
})

async function run(): Promise<{ file: PatternFile; output: string }> {
  vi.resetModules()
  await import('../../src/services/learn-patterns')
  const file = JSON.parse(readFileSync(join(out, 'test-bank.json'), 'utf8')) as PatternFile
  return { file, output: log.mock.calls.map((c) => c.join(' ')).join('\n') }
}

describe('patterns:learn', () => {
  it('writes the bank file with new patterns disabled and reports what it did', async () => {
    const { file, output } = await run()
    expect(file.bank).toBe('test-bank')
    expect(file.senders).toEqual(['Test Bank'])
    expect(file.patterns).toHaveLength(1)
    expect(file.patterns[0]).toMatchObject({
      enabled: false,
      type: 'debit',
      messages: 5,
      pattern:
        'Your card ending {account:MASKED} was charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Available balance {:CUR} {balance:NUM}',
    })
    expect(output).toContain('1 messages could not be decoded')
    expect(output).toMatch(/test-bank: 6 messages → 1 patterns \(1 new, 0 missing, 0 enabled\) → .*test-bank\.json/)
    expect(output).toMatch(/\[off\]\s+5 debit\s+test-bank:[0-9a-f]{10}/)
  })

  it('keeps your enabled flag and edits on the next run and lists review notes', async () => {
    const first = (await run()).file
    first.patterns[0] = { ...first.patterns[0], enabled: true, pattern: `${first.patterns[0].pattern} ` }
    first.patterns.push({ ...first.patterns[0], id: 'test-bank:old', review: ['seen once'] })
    writeFileSync(join(out, 'test-bank.json'), JSON.stringify(first))

    log.mockClear()
    const { file, output } = await run()
    expect(file.patterns[0]).toMatchObject({ enabled: true, pattern: first.patterns[0].pattern })
    expect(file.patterns[1]).toMatchObject({ id: 'test-bank:old', missing: true })
    expect(output).toMatch(/\(0 new, 1 missing, 2 enabled\)/)
    expect(output).toMatch(/\[on \]/)
    expect(output).not.toContain('test-bank:old') // missing patterns aren't listed
  })

  it('does not swallow errors other than undecodable messages', async () => {
    vi.doMock('../../src/services/ingest/decode', async (orig) => ({
      ...(await orig<typeof import('../../src/services/ingest/decode')>()),
      decode: () => {
        throw new Error('disk on fire')
      },
    }))
    await expect(run()).rejects.toThrow('disk on fire')
  })
})
