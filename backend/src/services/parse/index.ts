import type { AccountId, DecodedMessage, ParsedTransaction } from '../../utils/types'
import { accountFor } from '../../utils/accounts'

/**
 * Shared types for hand-written per-bank parsers. The parsers themselves live in
 * ./banks, which is gitignored: each one encodes the SMS templates of a real
 * account, so they are kept out of the repo. The import path in use is the
 * learned pattern parser in ../patterns — see PATTERNS.md.
 */

export interface BankParser {
  readonly bank: string
  canParse(message: DecodedMessage): boolean
  parse(message: DecodedMessage): ParsedTransaction
}

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

/**
 * Resolves a parser source (e.g. "adcb:card") to the own account configured for
 * it in config/wealthi.json. An unmapped source becomes a ParseError, so it is
 * collected with the other import errors instead of aborting the run.
 */
export function requireAccount(parser: string, source: string, raw: string): AccountId {
  const account = accountFor(source)
  if (!account) throw new ParseError(parser, raw, `no account mapped for source "${source}"`)
  return account
}

export type DispatchResult = { ok: true; value: ParsedTransaction } | { ok: false; error: ParseError | string }

/**
 * Dispatches a message to the first parser that recognises it. The registry is
 * passed in because ./banks is not part of the repo — a local setup calls this
 * with its own parsers; the committed pipeline never does.
 */
export function parseWith(parsers: BankParser[], message: DecodedMessage): DispatchResult {
  const parser = parsers.find((p) => p.canParse(message))
  if (!parser) return { ok: false, error: 'no parser found' }
  try {
    return { ok: true, value: parser.parse(message) }
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error }
    throw error
  }
}
