import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearnedPattern } from '../../src/services/patterns/learn'
import { buildChatDb, type FixtureMessage } from '../fixtures/chat-db'
import { at } from '../fixtures/messages'

// learnFromChatDb end to end over a fixture chat.db, with the store mocked: what
// it learns and hands to storeLearned. Storing it is in integration/patterns.test.ts.

const mocks = vi.hoisted(() => ({ storeLearned: vi.fn(), listBankSenders: vi.fn() }))
vi.mock('../../src/db/patterns', () => ({ storeLearned: mocks.storeLearned }))
vi.mock('../../src/db/bank-senders', () => ({ listBankSenders: mocks.listBankSenders }))

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
afterAll(() => chatDb.cleanup())

beforeEach(() => {
  mocks.storeLearned.mockReset().mockResolvedValue(1)
  mocks.listBankSenders.mockReset().mockResolvedValue(['Test Bank'])
})
afterEach(() => vi.doUnmock('../../src/services/ingest/decode'))

async function learn() {
  vi.resetModules()
  const { learnFromChatDb } = await import('../../src/services/learn-patterns')
  return learnFromChatDb(chatDb.path)
}

describe('learnFromChatDb', () => {
  it('learns each bank from its own SMS and stores the result, counting what it read', async () => {
    expect(await learn()).toEqual({ messages: 7, undecodable: 1, added: 1 })

    const stored = mocks.storeLearned.mock.calls[0][0] as Map<string, LearnedPattern[]>
    expect([...stored.keys()]).toEqual(['test-bank'])
    expect(stored.get('test-bank')).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^test-bank:[0-9a-f]{10}$/),
        type: 'debit',
        messages: 5,
        pattern:
          'Your card ending {account:MASKED} was charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Available balance {:CUR} {balance:NUM}',
      }),
    ])
  })

  it('refuses a chat.db that is not there', async () => {
    const { learnFromChatDb } = await import('../../src/services/learn-patterns')
    await expect(learnFromChatDb('/nowhere/chat.db')).rejects.toThrow('chat.db not found at: /nowhere/chat.db')
    expect(mocks.storeLearned).not.toHaveBeenCalled()
  })

  it('does not swallow errors other than undecodable messages', async () => {
    vi.doMock('../../src/services/ingest/decode', async (orig) => ({
      ...(await orig<typeof import('../../src/services/ingest/decode')>()),
      decode: () => {
        throw new Error('disk on fire')
      },
    }))
    await expect(learn()).rejects.toThrow('disk on fire')
    expect(mocks.storeLearned).not.toHaveBeenCalled()
  })
})
