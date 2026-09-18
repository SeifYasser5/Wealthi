/**
 * Mining — groups one bank's masked token sequences into templates.
 *
 * 1. Cluster: sequences are merged greedily (most frequent first). Two merge when
 *    their longest common subsequence covers most of their literal words; every
 *    stretch where they differ becomes a <TEXT> slot. A slot may absorb words,
 *    <NUM>/<ID> (shop names contain numbers) and a <MASKED> that isn't next to an
 *    account word ("GEIDEA *1234"), but never <CUR>/<DATE>/<TIME>/<URL> or an
 *    account number — so amounts can't leak into a merchant.
 * 2. Refine: a slot whose first (or last) word takes only a few distinct values
 *    is a template variant, not free text ("debited" / "credited"). The template
 *    is split on that word and each part is mined again. Each variant must show
 *    up in 2+ distinct sequences, otherwise a merchant seen in one exact message
 *    shape would pass for a variant.
 *
 * <NUM> and <ID> align with each other: an all-digit reference masks as <NUM>.
 */

import { escape, isPlaceholder, PUNCT } from './mask'

export const SLOT = '<TEXT>'
const BLOCKING = new Set(['<CUR>', '<DATE>', '<TIME>', '<URL>'])
/** A <MASKED> after one of these is an account/reference, which a slot must not swallow. */
const ACCOUNT_CONTEXT = /^(ending|account|card|card\/account|no|id|ref|حساب|بطاقه|بطاقة|بـرقم)$/i
const SEP = '\u0001'

/** Share of literal words two sequences must have in common to merge. */
const MIN_LITERAL_OVERLAP = 0.6
/** A slot edge word with at most this many distinct values is a variant. */
const MAX_VARIANTS = 3
/** Distinct sequences each variant needs before a split is trusted. */
const MIN_VARIANT_SUPPORT = 2
const MAX_SLOTS = 4
const MAX_DEPTH = 8

export interface Sequence {
  tokens: string[]
  /** Messages with exactly this masked sequence */
  count: number
}

export interface Template {
  elements: string[]
  members: Sequence[]
}

const isLiteral = (t: string) => !isPlaceholder(t)
const literalCount = (ts: string[]) => ts.filter(isLiteral).length
const REFERENCE = new Set(['<NUM>', '<ID>'])
const same = (a: string, b: string) => a !== SLOT && (a === b || (REFERENCE.has(a) && REFERENCE.has(b)))

/** Whether seq[k] may not become part of a slot. */
function blocksSlot(seq: string[], k: number): boolean {
  if (BLOCKING.has(seq[k])) return true
  if (seq[k] !== '<MASKED>') return false
  for (let i = k - 1; i >= 0; i--) if (!PUNCT.test(seq[i])) return ACCOUNT_CONTEXT.test(seq[i])
  return true
}

/** Index pairs of a longest common subsequence. Slots never match anything. */
function lcs(a: string[], b: string[]): [number, number][] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = same(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * The template covering both `elements` and `tokens`, or null when they are too
 * different. Returns the literal overlap as a score for picking the best merge.
 */
function generalize(elements: string[], tokens: string[]): { elements: string[]; score: number } | null {
  const pairs = lcs(elements, tokens)
  const matchedLiterals = pairs.filter(([i]) => isLiteral(elements[i])).length
  const score = matchedLiterals / Math.max(literalCount(elements), literalCount(tokens), 1)
  if (matchedLiterals < 2 || score < MIN_LITERAL_OVERLAP) return null

  const out: string[] = []
  let pi = -1
  let pj = -1
  const end: [number, number] = [elements.length, tokens.length]
  for (const [i, j] of [...pairs, end]) {
    const gapE = range(pi + 1, i)
    const gapT = range(pj + 1, j)
    if (gapE.length + gapT.length > 0) {
      if (gapE.some((k) => blocksSlot(elements, k)) || gapT.some((k) => blocksSlot(tokens, k))) return null
      out.push(SLOT)
    }
    if (i < elements.length) out.push(elements[i] === tokens[j] ? elements[i] : '<ID>')
    pi = i
    pj = j
  }
  if (out.filter((t) => t === SLOT).length > MAX_SLOTS) return null
  return { elements: out, score }
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k)
const regexCache = new Map<string, RegExp>()

/** Regex over SEP-joined tokens; one capture group per slot (0+ tokens, never a blocking placeholder). */
function compileTokens(elements: string[]): RegExp {
  const key = elements.join(SEP)
  let re = regexCache.get(key)
  if (!re) {
    const blocking = [...BLOCKING].map(escape).join('|')
    const slot = `((?:${SEP}(?!(?:${blocking})(?:${SEP}|$))[^${SEP}]+)*?)`
    const element = (e: string) => (e === SLOT ? slot : e === '<ID>' ? `${SEP}(?:<ID>|<NUM>)` : SEP + escape(e))
    re = new RegExp(`^${elements.map(element).join('')}$`)
    regexCache.set(key, re)
  }
  return re
}

/** Slot fillers (each a token list) when `tokens` fits the template, else null. */
function fillers(elements: string[], tokens: string[]): string[][] | null {
  const m = compileTokens(elements).exec(SEP + tokens.join(SEP))
  return m ? m.slice(1).map((g) => g.split(SEP).filter(Boolean)) : null
}

function cluster(sequences: Sequence[]): Template[] {
  const templates: Template[] = []
  const sorted = [...sequences].sort((a, b) => b.count - a.count || a.tokens.length - b.tokens.length)

  for (const seq of sorted) {
    const home = templates.find((t) => fillers(t.elements, seq.tokens))
    if (home) {
      home.members.push(seq)
      continue
    }
    let best: { template: Template; elements: string[]; score: number } | null = null
    for (const template of templates) {
      const g = generalize(template.elements, seq.tokens)
      if (g && (!best || g.score > best.score)) best = { template, ...g }
    }
    if (best) {
      best.template.elements = best.elements
      best.template.members.push(seq)
    } else {
      templates.push({ elements: seq.tokens, members: [seq] })
    }
  }
  return templates
}

/** Members grouped by the first/last word of some slot, when that word has few distinct values. */
function variantSplit(template: Template): Sequence[][] | null {
  const perMember = template.members.map((m) => fillers(template.elements, m.tokens)!)
  const slots = perMember[0]?.length ?? 0

  for (let k = 0; k < slots; k++) {
    for (const edge of [(f: string[]) => f[0], (f: string[]) => f[f.length - 1]]) {
      const groups = new Map<string, Sequence[]>()
      template.members.forEach((m, i) => {
        const word = edge(perMember[i][k]) ?? '∅'
        groups.set(word, [...(groups.get(word) ?? []), m])
      })
      const parts = [...groups.values()]
      const supported = parts.every((p) => p.length >= MIN_VARIANT_SUPPORT)
      if (parts.length >= 2 && parts.length <= MAX_VARIANTS && supported) return parts
    }
  }
  return null
}

function mine(sequences: Sequence[], depth = 0): Template[] {
  return cluster(sequences).flatMap((template) => {
    const parts = depth < MAX_DEPTH ? variantSplit(template) : null
    return parts ? parts.flatMap((part) => mine(part, depth + 1)) : [template]
  })
}

export const messageCount = (t: Template) => t.members.reduce((sum, m) => sum + m.count, 0)

/** Mines one bank's messages (as masked token lists), most frequent template first. */
export function mineTokens(tokenLists: string[][]): Template[] {
  const bySequence = new Map<string, Sequence>()
  for (const tokens of tokenLists) {
    const key = tokens.join(' ')
    const seq = bySequence.get(key)
    if (seq) seq.count++
    else bySequence.set(key, { tokens, count: 1 })
  }
  return mine([...bySequence.values()]).sort((a, b) => messageCount(b) - messageCount(a))
}
