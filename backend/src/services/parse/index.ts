import type { DecodedMessage, ParsedTransaction } from '../../utils/types'
import { DEFAULT_PARSERS } from './banks'

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
    super(`[${parser}] failed to parse: ${raw.slice(0, 80)}`)
    this.name = 'ParseError'
    this.cause = cause
  }
}

export type DispatchResult = { ok: true; value: ParsedTransaction } | { ok: false; error: ParseError | string }

export function parse(message: DecodedMessage): DispatchResult {
  const parser = DEFAULT_PARSERS.find((p) => p.canParse(message))
  if (!parser) return { ok: false, error: 'no parser found' }
  try {
    return { ok: true, value: parser.parse(message) }
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error }
    throw error
  }
}
