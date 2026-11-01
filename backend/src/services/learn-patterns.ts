import { existsSync } from 'node:fs'
import { readMessages } from './ingest/reader'
import { decode, DecodeError } from './ingest/decode'
import { learnBank, type LearnedPattern } from './patterns/learn'
import { bankOf } from './patterns/store'
import { storeLearned } from '../db/patterns'
import { config } from '../utils/config'
import type { DecodedMessage } from '../utils/types'

export interface LearnSummary {
  /** Bank SMS read */
  messages: number
  undecodable: number
  /** Patterns not stored before, now pending review */
  added: number
}

/**
 * Learns SMS patterns from chat.db and stores them in sms_patterns
 * (POST /api/patterns/learn, through run-learn.ts).
 *
 * New patterns are added pending, for review on the Learn page. Stored ones
 * keep their status and text (see storeLearned). Unlike the import, an
 * undecodable message is counted and left out instead of aborting the run.
 */
export async function learnFromChatDb(chatDbPath: string): Promise<LearnSummary> {
  if (!existsSync(chatDbPath)) throw new Error(`chat.db not found at: ${chatDbPath}`)

  const byBank = new Map<string, DecodedMessage[]>()
  let messages = 0
  let undecodable = 0
  for (const row of readMessages(chatDbPath, config.bankSenders)) {
    messages++
    try {
      const message = decode(row)
      const bank = bankOf(message.sender)
      const bankMessages = byBank.get(bank)
      if (bankMessages) bankMessages.push(message)
      else byBank.set(bank, [message])
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error
      undecodable++
    }
  }

  const learned = new Map<string, LearnedPattern[]>()
  for (const [bank, bankMessages] of byBank) learned.set(bank, learnBank(bank, bankMessages))
  const added = await storeLearned(learned)
  return { messages, undecodable, added }
}
