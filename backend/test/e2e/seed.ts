/**
 * Seeds the Playwright stack's test database with the synthetic ledger.
 * Run by e2e/stack.mjs with DATABASE_URL (a *_test db), WEALTHI_CONFIG_PATH and
 * WEALTHI_PATTERNS_DIR already pointing at the fixtures.
 */
import { prisma } from '../../src/db/client'
import { importFromChatDb } from '../../src/services/importer'
import { buildChatDb } from '../fixtures/chat-db'
import { LEDGER } from '../fixtures/messages'
import { assertTestDatabase } from '../setup/guard'

async function main() {
  assertTestDatabase(process.env.DATABASE_URL ?? '')
  const chatDb = buildChatDb(LEDGER)
  try {
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
