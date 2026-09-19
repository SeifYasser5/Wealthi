import { VALUE_PATTERNS, asciiDigits, escape, type SlotType } from './mask'

/**
 * Pattern files — config/patterns/<bank>.json, written by `npm run patterns:learn`
 * and read by the pattern parser. They hold transaction patterns only; SMS that
 * match none (OTPs, declines, promos) are not transactions. Gitignored: patterns
 * are mined from your own messages and can carry literal text from them.
 *
 * A pattern is a template written as editable text: literal tokens and
 * `{role:TYPE}` slots separated by spaces, e.g.
 *
 *   Your Card ending {account:MASKED} has been charged with {currency:CUR} {amount:NUM}
 *   at {merchant:TEXT} on {date:DATE} {time:TIME} and your Available Balance is {balance:NUM} {:CUR}
 *
 * An empty role (`{:CUR}`) means "must be there, value unused". Tokens compile to
 * a regex with optional whitespace between them, since masking split glued text
 * ("bal.EGP383.80" → "bal . {:CUR} {balance:NUM}"). It runs on the SMS with its
 * original spacing, so a merchant comes out exactly as the bank sent it.
 */

/** Every slot role a pattern may name. `direction` holds the direction word, for `type: "by-keyword"`. */
export const ROLES = [
  'amount',
  'currency',
  'balance',
  'account',
  'merchant',
  'counterparty',
  'description',
  'reference',
  'date',
  'time',
  'direction',
] as const

export type Role = (typeof ROLES)[number]

export interface Pattern {
  /** "<bank>:<hash of the mined template>" — stable across learn runs */
  id: string
  /** Only enabled patterns are used by the parser. Learn adds new patterns disabled and never changes this. */
  enabled: boolean
  /** debit/credit, or by-keyword when the direction word sits in a {direction:TEXT} slot */
  type: 'debit' | 'credit' | 'by-keyword'
  pattern: string
  /** What learn produced. When `pattern` differs, it was edited by hand. */
  generated: string
  /** Why learn labelled it this way */
  reason: string
  /** Things to check before enabling */
  review?: string[]
  /** Messages it matched in the latest learn run */
  messages: number
  /** Not produced by the latest learn run (kept so edits and flags aren't lost) */
  missing?: true
}

export interface PatternFile {
  bank: string
  /** chat.db handle ids this bank sends from */
  senders: string[]
  patterns: Pattern[]
}

export interface Extracted {
  patternId: string
  type: 'debit' | 'credit' | null
  amount: number | null
  /** Raw currency token as printed ("EGP", "جم", …); see CURRENCIES */
  currency: string | null
  balance: number | null
  /** merchant, else counterparty, else description */
  merchant: string | null
  /** "<bank>:<last 4 digits>" — mapped to an own account by accountSources */
  accountKey: string | null
  reference: string | null
}

export const CURRENCIES: Record<string, 'EGP' | 'USD' | 'EUR'> = {
  EGP: 'EGP',
  جم: 'EGP',
  USD: 'USD',
  دولار: 'USD',
  EUR: 'EUR',
}

export const CREDIT_WORDS = [/\bcredited\b/i, /\breceived\b/i, /\brefunded\b/i, /\breversal\b/i, /[اإ]ضافة/, /إلى حساب/]
export const DEBIT_WORDS = [
  /\bdebited\b/i,
  /\bcharged\b/i,
  /\bspent\b/i,
  /\bsuccessful transaction\b/i,
  /\bsent\b/i,
  /خصم/,
  /سحب/,
]

const DIRECTION_WORDS = [...CREDIT_WORDS, ...DEBIT_WORDS]

export const hasDirectionWord = (text: string) => DIRECTION_WORDS.some((re) => re.test(text))

export function directionOf(text: string): 'debit' | 'credit' | null {
  const credit = CREDIT_WORDS.some((re) => re.test(text))
  const debit = DEBIT_WORDS.some((re) => re.test(text))
  return credit === debit ? null : credit ? 'credit' : 'debit'
}

const SLOT_TOKEN = /^\{(\w*):([A-Z]+)\}$/
const ROLE_NAMES = new Set<string>(ROLES)

export function slotToken(role: Role | null, type: SlotType | 'TEXT'): string {
  return `{${role ?? ''}:${type}}`
}

export interface Compiled {
  re: RegExp
  /** Role of each capture group, in order */
  roles: (Role | null)[]
  literals: number
}

const compiled = new Map<string, Compiled>()

/** Compiles a pattern string; throws on an unknown slot type or role. */
export function compile(pattern: string): Compiled {
  let c = compiled.get(pattern)
  if (!c) {
    const roles: (Role | null)[] = []
    let literals = 0
    const parts = pattern.split(/\s+/).map((token) => {
      const slot = token.match(SLOT_TOKEN)
      if (!slot) {
        literals++
        return escape(token)
      }
      const [, role, type] = slot
      if (!(type in VALUE_PATTERNS)) throw new Error(`unknown slot type "${type}" in pattern: ${pattern}`)
      if (role && !ROLE_NAMES.has(role)) throw new Error(`unknown role "${role}" in pattern: ${pattern}`)
      roles.push((role || null) as Role | null)
      return `(${VALUE_PATTERNS[type as SlotType | 'TEXT']})`
    })
    c = { re: new RegExp(String.raw`^\s*${parts.join(String.raw`\s*`)}\s*$`, 'su'), roles, literals }
    compiled.set(pattern, c)
  }
  return c
}

const toNumber = (raw: string) => parseFloat(raw.replace(/[\s,]/g, ''))

/**
 * Values of the most specific pattern matching the whole message (most literal
 * words wins), or null when none match.
 */
export function extract(bank: string, patterns: Pattern[], text: string): Extracted | null {
  const source = asciiDigits(text)
  let best: { p: Pattern; c: Compiled; m: RegExpExecArray } | null = null
  for (const p of patterns) {
    const c = compile(p.pattern)
    if (best && c.literals <= best.c.literals) continue
    const m = c.re.exec(source)
    if (m) best = { p, c, m }
  }
  if (!best) return null

  const { p, c, m } = best
  const get = (role: Role) => {
    const i = c.roles.indexOf(role)
    return i === -1 ? null : m[i + 1].trim()
  }
  const amount = get('amount')
  const balance = get('balance')
  const digits = get('account')?.replace(/\D/g, '') ?? ''
  return {
    patternId: p.id,
    type: p.type === 'by-keyword' ? directionOf(get('direction') ?? '') : p.type,
    amount: amount === null ? null : toNumber(amount),
    currency: get('currency'),
    balance: balance === null ? null : toNumber(balance),
    merchant: get('merchant') || get('counterparty') || get('description') || null,
    accountKey: digits ? `${bank}:${digits.slice(-4)}` : null,
    reference: get('reference'),
  }
}
