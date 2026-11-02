/**
 * Seeds the Playwright stack's test database with the synthetic ledger.
 * Run by e2e/stack.mjs with DATABASE_URL (a *_test db) and WEALTHI_CONFIG_PATH
 * already pointing at the fixtures; the fixture patterns and settings are stored
 * first, since the importer parses with what sms_patterns holds and reads its
 * accounts, sources, transfer rules and senders from their tables.
 */
import { prisma } from '../../src/db/client'
import { replacePatterns } from '../../src/db/patterns'
import { seedSettings } from '../../src/db/settings'
import { config } from '../../src/utils/config'
import { importFromChatDb } from '../../src/services/importer'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { assertTestDatabase } from '../setup/guard'
import { fixturePatterns } from '../fixtures/pattern-files'

async function main() {
  assertTestDatabase(process.env.DATABASE_URL ?? '')
  const chatDb = buildChatDb(LEDGER)
  try {
    await replacePatterns(fixturePatterns())
    await seedSettings(config)
    const { totalStored, months } = await importFromChatDb(chatDb.path)
    console.log(`[e2e] seeded ${totalStored} transactions over ${months} months`)
  } finally {
    chatDb.cleanup()
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
