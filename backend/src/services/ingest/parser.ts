import type { Currency, DecodedMessage, ParsedTransaction } from '../../utils/types'
import { ACCOUNTS, accountFor } from '../../utils/config'
import { CURRENCIES, extract, type Pattern, type PatternFile } from '../patterns/pattern'
import { bankOf } from '../patterns/store'
import { parseMinor, type Minor } from '../../utils/money'
import { sanitizeMessageText } from './sanitize'

/**
 * Parses bank SMS with the enabled learned patterns. The importer builds one per
 * run from the sms_patterns table (loadEnabledPatterns), so a pattern enabled on
 * the Learn page applies to the next import.
 *
 * A message is matched against the enabled patterns of its bank, bankOf(sender):
 * - a match → a ParsedTransaction
 * - a charge in another currency than its account (a USD charge on an EGP
 *   card) → skipped: the SMS doesn't say what it cost in the account currency
 * - no match (OTPs, declines, promos, new templates), or values that don't add
 *   up → a ParseError, collected by the importer like any other parse error
 *
 * The account comes from accountSources["<bank>:<last 4 digits>"].
 */

export class ParseError extends Error {
  readonly cause: unknown

  constructor(
    public readonly parser: string,
    public readonly raw: string,
    cause?: unknown,
  ) {
    super(`[${parser}] failed to parse${typeof cause === 'string' ? ` (${cause})` : ''}: ${raw.slice(0, 80)}`)
    this.name = 'ParseError'
    this.cause = cause
  }
}

export type PatternParseResult =
  | { ok: true; value: ParsedTransaction; patternId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: ParseError }

const PARSER = 'patterns'

export type PatternParser = (message: DecodedMessage) => PatternParseResult

export function createPatternParser(files: PatternFile[]): PatternParser {
  const byBank = new Map<string, Pattern[]>()
  for (const file of files)
    byBank.set(
      file.bank,
      file.patterns.filter((p) => p.enabled),
    )

  return (message) => {
    const fail = (cause: string): PatternParseResult => ({
      ok: false,
      skipped: false,
      error: new ParseError(PARSER, message.text, cause),
    })

    const bank = bankOf(message.sender)
    const enabled = byBank.get(bank)
    if (!enabled) return fail(`no enabled patterns for sender "${message.sender}"`)

    const x = extract(bank, enabled, message.text)
    if (!x) return fail('no enabled pattern matched')

    const where = `pattern ${x.patternId}`
    if (x.type === null) return fail(`${where}: could not tell debit from credit`)
    if (x.amount === null) return fail(`${where}: no amount`)
    const amount = parseMinor(x.amount)
    if (!amount.ok) return fail(`${where}: ${amount.error}`)
    const currency = CURRENCIES[x.currency ?? '']
    if (!currency) return fail(`${where}: unknown currency "${x.currency}"`)
    if (!x.accountKey) return fail(`${where}: no account number in message`)
    const account = accountFor(x.accountKey)
    if (!account) return fail(`${where}: no account mapped for source "${x.accountKey}"`)
    const accountCurrency = ACCOUNTS.find((a) => a.id === account)?.currency
    if (currency !== accountCurrency) {
      return {
        ok: false,
        skipped: true,
        reason: `${where}: ${currency} amount on ${accountCurrency} account ${account}`,
      }
    }
    let reportedBalance: Minor | null = null
    if (x.balance !== null) {
      const balance = parseMinor(x.balance)
      if (!balance.ok) return fail(`${where}: balance: ${balance.error}`)
      reportedBalance = balance.value
    }

    return {
      ok: true,
      patternId: x.patternId,
      value: {
        type: x.type,
        amount: amount.value,
        currency: currency as Currency,
        account,
        merchant: x.merchant,
        counterAccount: null,
        reportedBalance,
        transactedAt: message.messageDate,
        messageGuid: message.guid,
        sourceRowid: message.rowid,
        // Stored for display and diagnosis, cleaned of invisible characters —
        // unlike the text handed to extract() above, which stays byte-exact.
        rawText: sanitizeMessageText(message.text),
      },
    }
  }
}
