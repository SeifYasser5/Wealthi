import 'dotenv/config'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import app from './app'
import { importFromChatDb } from './services/importer'

const PORT = process.env.PORT || 3000

// Loopback by default: the API is unauthenticated, so binding every interface
// would expose your transactions to the whole network. Set HOST to widen it.
const HOST = process.env.HOST ?? '127.0.0.1'

// Place your iMessage DB at backend/data/chat.db, or override via IMESSAGE_DB_PATH.
const CHAT_DB_PATH = process.env.IMESSAGE_DB_PATH ?? join(process.cwd(), 'data', 'chat.db')

app.listen(Number(PORT), HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`)

  if (!existsSync(CHAT_DB_PATH)) {
    console.log(`[import] No chat.db found at ${CHAT_DB_PATH} — skipping auto-import.`)
    console.log(`[import] Copy your iMessage DB there or set IMESSAGE_DB_PATH.`)
    return
  }

  console.log(`[import] Found ${CHAT_DB_PATH} — starting import...`)

  importFromChatDb(CHAT_DB_PATH)
    .then(({ months, totalStored, errors }) => {
      console.log(`[import] Done: ${months} months, ${totalStored} transactions stored, ${errors.length} parse errors.`)
    })
    .catch((err: unknown) => {
      console.error('[import] Failed:', err instanceof Error ? err.message : err)
    })
})
