import { existsSync } from 'node:fs'
import { withDemoChatDb } from '../demo/seed'
import { learnFromChatDb, type LearnSummary } from './learn-patterns'
import { chatDbPath } from './run-import'
import type { LearnResponse } from '../utils/types'

let running: Promise<LearnResponse> | null = null

/**
 * Runs a learn (POST /api/patterns/learn) and reports what it did.
 *
 * One at a time, like the import: a call made while one is in progress joins
 * it and gets the same report, so a double click can't store the same new
 * pattern twice.
 */
export function runLearn(): Promise<LearnResponse> {
  running ??= learnOnce().finally(() => {
    running = null
  })
  return running
}

async function learnOnce(): Promise<LearnResponse> {
  const started = Date.now()
  // Demo mode has no chat.db: it learns from the synthetic ledger, whose
  // patterns are already stored, so a run there finds nothing new.
  const demo = process.env.WEALTHI_DEMO === 'true'
  const source = demo ? 'demo ledger' : chatDbPath()

  const report = (status: LearnResponse['status'], summary: LearnSummary): LearnResponse => ({
    status,
    source,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    ...summary,
  })

  if (!demo && !existsSync(source)) {
    console.log(`[learn] No chat.db found at ${source} — skipping.`)
    return report('skipped', { messages: 0, undecodable: 0, added: 0 })
  }

  console.log(`[learn] Learning patterns from ${source}...`)
  try {
    const summary = demo ? await withDemoChatDb(new Date(), learnFromChatDb) : await learnFromChatDb(source)
    console.log(
      `[learn] Done: ${summary.messages} messages, ${summary.added} new patterns, ${summary.undecodable} undecodable.`,
    )
    return report('completed', summary)
  } catch (err) {
    console.error('[learn] Failed:', err instanceof Error ? err.message : err)
    throw err
  }
}
