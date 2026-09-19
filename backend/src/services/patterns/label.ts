/**
 * Labelling — turns a mined template into a transaction pattern: which
 * direction, and what each slot means. Heuristics over the template's literal
 * words first, then over the values its messages actually hold. Whatever it
 * can't decide stays unlabelled and is listed under `review`. Templates that
 * aren't transactions (OTPs, declines, statements, promos) are dropped.
 */

import { asciiDigits, isPlaceholder, PUNCT, type SlotType } from './mask'
import { SLOT, messageCount, type Template } from './mine'
import { compile, directionOf, hasDirectionWord, slotToken, type Pattern, type Role } from './pattern'

export type Labelled = Pick<Pattern, 'type' | 'pattern' | 'reason' | 'review' | 'messages'>

/** Not a posted transaction even though it carries an amount. */
const IGNORE_WORDS = [
  /\bdeclined\b/i,
  /\brejected\b/i,
  /\bOTP\b/,
  /\bpassword\b/i,
  /\boutstanding balance\b/i,
  /\bminimum\b/i,
  /رفض/,
  /لم يتم/,
  /كشف حساب/,
  /نذكركم/,
  /لا يكفي/,
]
const BALANCE_WORDS = /^(balance|bal|available|رصيد|الرصيد|المتاح|متاح)$/i
const ACCOUNT_WORDS = /^(account|card\/account|card|حساب|بطاقه|بطاقة)$/i
const REFERENCE_WORDS = /^(ref|ref#|id)$/i
const MERCHANT_WORDS = /^(at|in|@|payment)$/i
const COUNTERPARTY_WORDS = /^(to|from)$/i
/** Placeholders whose value may be an account number or a reference. */
const ID_LIKE = new Set(['<MASKED>', '<NUM>', '<ID>'])
/** A word of an all-caps Latin name ("JOHN", "O'NEIL") */
const NAME_WORD = /^[A-Z][A-Z'.\-]+$/

const typeOf = (t: string) => t.slice(1, -1) as SlotType | 'TEXT'

/** Up to `n` literal words before index `i`, nearest first, skipping punctuation and stopping at a placeholder. */
function wordsBefore(elements: string[], i: number, n: number): string[] {
  const words: string[] = []
  for (let k = i - 1; k >= 0 && words.length < n; k--) {
    if (isPlaceholder(elements[k])) break
    if (!PUNCT.test(elements[k])) words.push(elements[k])
  }
  return words
}

/** The nearest element before index `i` that isn't punctuation. */
function elementBefore(elements: string[], i: number): string | undefined {
  for (let k = i - 1; k >= 0; k--) if (!PUNCT.test(elements[k])) return elements[k]
  return undefined
}

/**
 * A name that never varied was mined as literal text ("from JOHN SMITH with").
 * Turn a run of 2+ all-caps words after "to"/"from" into a slot so it isn't
 * baked into the pattern.
 */
function unbakeNames(elements: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < elements.length; i++) {
    out.push(elements[i])
    if (!COUNTERPARTY_WORDS.test(elements[i])) continue
    let j = i + 1
    while (j < elements.length && NAME_WORD.test(elements[j])) j++
    if (j - i - 1 >= 2) {
      out.push(SLOT)
      i = j - 1
    }
  }
  return out
}

/** `directionSlot` is the element index of the slot holding the direction word (by-keyword patterns), else -1. */
function roleByContext(elements: string[], directionSlot: number): (Role | null)[] {
  const roles: (Role | null)[] = elements.map(() => null)
  const taken = new Set<Role>()
  const assign = (i: number, role: Role) => {
    if (roles[i] !== null || taken.has(role)) return false
    roles[i] = role
    taken.add(role)
    return true
  }

  // References and accounts, by the word in front.
  elements.forEach((e, i) => {
    const prev = wordsBefore(elements, i, 1)[0] ?? ''
    if (ID_LIKE.has(e) && REFERENCE_WORDS.test(prev)) assign(i, 'reference')
    else if (e === '<MASKED>') assign(i, 'account')
    else if (e === '<NUM>' && ACCOUNT_WORDS.test(prev)) assign(i, 'account')
  })

  // Money: each <CUR> pairs with the <NUM> right after it, else right before
  // (masking tries "EGP 100" before "100 EGP"). Balance if a balance word leads it.
  elements.forEach((e, i) => {
    if (e !== '<CUR>') return
    const num = [i + 1, i - 1].find((k) => elements[k] === '<NUM>' && roles[k] === null)
    if (num === undefined) return
    const lead = wordsBefore(elements, Math.min(i, num), 4)
    if (lead.some((w) => BALANCE_WORDS.test(w))) assign(num, 'balance')
    else if (assign(num, 'amount')) assign(i, 'currency')
  })

  // A bare number after a balance word ("Available Balance is 1 038.41").
  elements.forEach((e, i) => {
    if (e === '<NUM>' && wordsBefore(elements, i, 4).some((w) => BALANCE_WORDS.test(w))) assign(i, 'balance')
  })

  elements.forEach((e, i) => {
    if (e === '<DATE>') assign(i, 'date')
    if (e === '<TIME>') assign(i, 'time')
    if (e !== SLOT) return
    const prev = wordsBefore(elements, i, 1)[0] ?? ''
    if (i === directionSlot) assign(i, 'direction')
    else if (REFERENCE_WORDS.test(prev)) assign(i, 'reference')
    else if (COUNTERPARTY_WORDS.test(prev)) assign(i, 'counterparty')
    else if (MERCHANT_WORDS.test(prev)) assign(i, 'merchant')
    // Description straight after the date/time: "خصم … فى <DATE> <TEXT> الرصيد", "يوم <DATE> <TIME> - <TEXT>"
    else if (['<DATE>', '<TIME>'].includes(elementBefore(elements, i) ?? '')) assign(i, 'merchant')
  })

  return roles
}

interface SlotValues {
  /** Element index of every placeholder, in capture-group order */
  slots: number[]
  /** Values each placeholder took, one list per entry of `slots` */
  values: string[][]
  matched: number
}

/**
 * The values every placeholder takes across the template's messages. Runs on
 * digit-normalised text, as masking and `extract()` do, so a message written
 * with Arabic-Indic digits matches the template it was mined into.
 */
function slotValues(elements: string[], texts: string[]): SlotValues {
  const { re } = compile(elements.map((e) => (isPlaceholder(e) ? slotToken(null, typeOf(e)) : e)).join(' '))
  const slots = elements.flatMap((e, i) => (isPlaceholder(e) ? [i] : []))
  const values = slots.map(() => [] as string[])
  let matched = 0
  for (const text of texts) {
    const m = re.exec(asciiDigits(text))
    if (!m) continue
    matched++
    slots.forEach((_, g) => values[g].push(m[g + 1].trim()))
  }
  return { slots, values, matched }
}

/**
 * Labels what context left unknown by the values the messages hold: a 3–4 digit
 * value with at most 3 distinct values is an account ("on 1234"), a value that
 * is (almost) always different is a reference, a constant 5+ digit number (a
 * hotline) stays unlabelled. A leftover text slot becomes the description.
 */
function roleByValues(elements: string[], roles: (Role | null)[], { slots, values }: SlotValues): (Role | null)[] {
  const next = [...roles]
  slots.forEach((i, g) => {
    if (next[i] !== null || !ID_LIKE.has(elements[i]) || values[g].length === 0) return
    // Money that lost the amount/balance race (e.g. an installment next to the amount)
    if (elements[i - 1] === '<CUR>' || elements[i + 1] === '<CUR>') return
    const distinct = new Set(values[g]).size
    const accountLike = values[g].every((v) => /^[*X]*\d{3,4}$/.test(v))
    if (!next.includes('account') && accountLike && distinct <= 3) next[i] = 'account'
    else if (!next.includes('reference') && values[g].length >= 3 && distinct / values[g].length >= 0.9) {
      next[i] = 'reference'
    }
  })

  // Free text describes the transaction when nothing else names it ("(Cash)") —
  // if it holds real words, not just a preposition that varies ("on" / "from").
  if (!next.some((r) => r === 'merchant' || r === 'counterparty')) {
    const g = slots.findIndex((i, k) => elements[i] === SLOT && next[i] === null && values[k].some((v) => v.length > 4))
    if (g !== -1) next[slots[g]] = 'description'
  }
  return next
}

/** `texts` are the raw messages the template was mined from. Null when the template isn't a transaction. */
export function label(template: Template, texts: string[]): Labelled | null {
  const elements = unbakeNames(template.elements)
  const literal = elements.filter((e) => !isPlaceholder(e)).join(' ')
  if (IGNORE_WORDS.some((re) => re.test(literal))) return null

  const found = slotValues(elements, texts)
  const textSlots = found.slots.flatMap((i, g) => (elements[i] === SLOT ? [{ i, g }] : []))
  // Direction from the template text; failing that, from a slot's values (by-keyword).
  const literalDirection = directionOf(literal)
  const directionSlot = literalDirection
    ? undefined
    : textSlots.find(({ g }) => hasDirectionWord(found.values[g].join(' | ')))
  const type: Pattern['type'] | null = literalDirection ?? (directionSlot ? 'by-keyword' : null)
  if (!type) return null
  const reason = directionSlot
    ? `direction word inside TEXT slot #${textSlots.indexOf(directionSlot) + 1}`
    : `${type} keyword in template text`

  const contextRoles = roleByContext(elements, directionSlot?.i ?? -1)
  const roles = roleByValues(elements, contextRoles, found)
  if (!roles.includes('amount')) return null

  const messages = messageCount(template)
  const review: string[] = []
  if (found.matched < texts.length) review.push(`matches ${found.matched} of its ${texts.length} messages`)
  if (!roles.includes('account')) review.push('no account slot')
  if (messages === 1) review.push('seen once')
  textSlots.forEach(({ i }, k) => {
    if (roles[i] === null) review.push(`unlabelled TEXT slot #${k + 1}`)
  })

  return {
    type,
    pattern: elements.map((e, i) => (isPlaceholder(e) ? slotToken(roles[i], typeOf(e)) : e)).join(' '),
    reason,
    ...(review.length ? { review } : {}),
    messages,
  }
}
