import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { seedDemo } from '../demo/seed'
import { importFromChatDb } from './importer'
import { ParseError } from './ingest/parser'
import { sanitizeMessageText } from './ingest/sanitize'
import type { ImportError, ImportParseError, ImportResponse, ImportSummary } from '../utils/types'

/** Place your iMessage DB at backend/data/chat.db, or override via IMESSAGE_DB_PATH. */
export function chatDbPath(): string {
  return process.env.IMESSAGE_DB_PATH ?? join(process.cwd(), 'data', 'chat.db')
}

let running: Promise<ImportResponse> | null = null

/**
 * Runs the live import (POST /api/import) and reports what it did.
 *
 * One at a time: the import wipes and rebuilds the ledger, so a call made while
 * one is in progress joins it and gets the same report instead of starting a
 * second rebuild over the first. Once it settles, the next call starts afresh.
 */
export function runImport(): Promise<ImportResponse> {
  running ??= importOnce().finally(() => {
    running = null
  })
  return running
}

async function importOnce(): Promise<ImportResponse> {
  const started = Date.now()
  // Demo mode has no chat.db: importing there rebuilds the synthetic ledger.
  const demo = process.env.WEALTHI_DEMO === 'true'
  const source = demo ? 'demo ledger' : chatDbPath()

  const report = (status: ImportResponse['status'], summary: ImportSummary): ImportResponse => ({
    status,
    source,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    months: summary.months,
    totalStored: summary.totalStored,
    parseErrors: summary.errors.map(toParseError),
  })

  if (!demo && !existsSync(source)) {
    console.log(`[import] No chat.db found at ${source} — skipping.`)
    return report('skipped', { months: 0, totalStored: 0, errors: [] })
  }

  console.log(`[import] Importing from ${source}...`)
  try {
    const summary = demo ? await seedDemo() : await importFromChatDb(source)
    console.log(
      `[import] Done: ${summary.months} months, ${summary.totalStored} transactions stored, ${summary.errors.length} parse errors.`,
    )
    return report('completed', summary)
  } catch (err) {
    console.error('[import] Failed:', err instanceof Error ? err.message : err)
    throw err
  }
}

function toParseError({ decoded, cause }: ImportError): ImportParseError {
  return {
    sender: decoded.sender,
    messageDate: decoded.messageDate.toISOString(),
    text: sanitizeMessageText(decoded.text),
    reason: parseFailureReason(cause),
  }
}

// A ParseError's message repeats the SMS text; its string cause is the reason alone.
function parseFailureReason(cause: unknown): string {
  if (cause instanceof ParseError && typeof cause.cause === 'string') return cause.cause
  return cause instanceof Error ? cause.message : String(cause)
}
