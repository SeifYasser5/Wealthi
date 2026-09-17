import { join } from 'node:path'
import { readMessages } from './services/reader'
import { decode, DecodeError } from './services/decode'
import { learnBank } from './services/patterns/learn'
import { bankOf, loadPatternFiles, mergePatterns, savePatternFile } from './services/patterns/store'
import { config } from './utils/config'
import type { DecodedMessage } from './utils/types'

/**
 * Learns SMS patterns from chat.db and merges them into config/patterns/<bank>.json.
 *
 *   npm run patterns:learn
 *
 * New patterns are added disabled — review them and set "enabled": true.
 * Existing patterns keep your flags and edits (see mergePatterns).
 */

const CHAT_DB_PATH = process.env.IMESSAGE_DB_PATH ?? join(process.cwd(), 'data', 'chat.db')

const byBank = new Map<string, DecodedMessage[]>()
let undecodable = 0
for (const row of readMessages(CHAT_DB_PATH, config.bankSenders)) {
  try {
    const message = decode(row)
    const bank = bankOf(message.sender)
    byBank.set(bank, [...(byBank.get(bank) ?? []), message])
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error
    undecodable++
  }
}
if (undecodable) console.log(`${undecodable} messages could not be decoded`)

const existing = new Map(loadPatternFiles().map((f) => [f.bank, f]))
for (const [bank, messages] of byBank) {
  const senders = [...new Set(messages.map((m) => m.sender))]
  const { file, added, missing } = mergePatterns(existing.get(bank), bank, senders, learnBank(bank, messages))
  const path = savePatternFile(file)

  const enabled = file.patterns.filter((p) => p.enabled).length
  console.log(
    `\n${bank}: ${messages.length} messages → ${file.patterns.length} patterns (${added} new, ${missing} missing, ${enabled} enabled) → ${path}`,
  )
  for (const p of file.patterns.filter((p) => !p.missing)) {
    const flags = p.review ? `  ⚠ ${p.review.join('; ')}` : ''
    console.log(
      `  [${p.enabled ? 'on ' : 'off'}] ${String(p.messages).padStart(5)} ${(p.type ?? '').padEnd(10)} ${p.id}${flags}`,
    )
    console.log(`        ${p.pattern}`)
  }
}
