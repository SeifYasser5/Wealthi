/**
 * Mining, LCS variant — groups one bank's masked token sequences into templates
 * by aligning them with a longest common subsequence.
 *
 * Not wired: `learn.ts` uses `mine.ts`. This one carries no assumption about how
 * many things vary in a template, so it can describe a message with several
 * independent slots, at the cost of a similarity threshold and slot boundaries
 * that drift. Kept for banks whose templates `mine.ts` cannot express; still
 * under review, and not measured against real data beyond the three banks here.
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
import { messageCount, SLOT, type Sequence, type Template } from './mine'

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

/** Whether any of seq[from..to) may not become part of a slot. */
function gapBlocks(seq: string[], from: number, to: number): boolean {
  for (let k = from; k < to; k++) if (blocksSlot(seq, k)) return true
  return false
}

/** Index pairs of a longest common subsequence. Slots never match anything. */
function lcs(a: string[], b: string[]): [number, number][] {
  // dp[i][j] = LCS length of a[i..] and b[j..], stored flat as dp[i * w + j].
  const w = b.length + 1
  const dp = new Uint16Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * w + j] = same(a[i], b[j]) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
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
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * The template covering both `elements` and `tokens`, or null when they are too
 * different. Returns the literal overlap as a score for picking the best merge.
 */
function generalize(elements: string[], tokens: string[]): { elements: string[]; score: number } | null {
  // A literal only matches an identical literal, so the LCS can't match more
  // literals than the smaller side has: skip the LCS when that bound already fails.
  const fewest = Math.min(literalCount(elements), literalCount(tokens))
  const most = Math.max(literalCount(elements), literalCount(tokens), 1)
  if (fewest < 2 || fewest / most < MIN_LITERAL_OVERLAP) return null

  const pairs = lcs(elements, tokens)
  const matchedLiterals = pairs.filter(([i]) => isLiteral(elements[i])).length
  const score = matchedLiterals / most
  if (matchedLiterals < 2 || score < MIN_LITERAL_OVERLAP) return null

  const out: string[] = []
  let slots = 0
  let pi = -1
  let pj = -1
  const end: [number, number] = [elements.length, tokens.length]
  for (const [i, j] of [...pairs, end]) {
    if (i > pi + 1 || j > pj + 1) {
      if (gapBlocks(elements, pi + 1, i) || gapBlocks(tokens, pj + 1, j)) return null
      out.push(SLOT)
      slots++
    }
    if (i < elements.length) out.push(elements[i] === tokens[j] ? elements[i] : '<ID>')
    pi = i
    pj = j
  }
  if (slots > MAX_SLOTS) return null
  return { elements: out, score }
}

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

/** Token index ranges [from, to) each slot covers when `tokens` matches the template's regex, else null. */
function slotRanges(elements: string[], tokens: string[]): [number, number][] | null {
  const m = compileTokens(elements).exec(SEP + tokens.join(SEP))
  if (!m) return null
  const ranges: [number, number][] = []
  let at = 0
  let group = 1
  for (const e of elements) {
    // A slot's capture holds SEP + token per token it absorbed; a literal element consumes one token.
    const n = e === SLOT ? m[group++].split(SEP).length - 1 : 1
    if (e === SLOT) ranges.push([at, at + n])
    at += n
  }
  return ranges
}

/** Whether `tokens` fits the template, with no slot swallowing an account number (same rule as merging). */
function fits(elements: string[], tokens: string[]): boolean {
  const ranges = slotRanges(elements, tokens)
  return ranges !== null && !ranges.some(([from, to]) => gapBlocks(tokens, from, to))
}

/** Slot fillers (each a token list) when `tokens` matches the template's regex, else null. */
function fillers(elements: string[], tokens: string[]): string[][] | null {
  return slotRanges(elements, tokens)?.map(([from, to]) => tokens.slice(from, to)) ?? null
}

function cluster(sequences: Sequence[]): Template[] {
  const templates: Template[] = []
  const sorted = [...sequences].sort((a, b) => b.count - a.count || a.tokens.length - b.tokens.length)

  for (const seq of sorted) {
    const home = templates.find((t) => fits(t.elements, seq.tokens))
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

const first = (filler: string[]) => filler[0]
const last = (filler: string[]) => filler[filler.length - 1]

/** Members grouped by the first/last word of some slot, when that word has few distinct values. */
function variantSplit(template: Template): Sequence[][] | null {
  if (!template.elements.includes(SLOT)) return null
  const perMember = template.members.map((m) => fillers(template.elements, m.tokens)!)
  const slots = perMember[0]?.length ?? 0

  for (let k = 0; k < slots; k++) {
    for (const edge of [first, last]) {
      const groups = new Map<string, Sequence[]>()
      template.members.forEach((m, i) => {
        const word = edge(perMember[i][k]) ?? '∅'
        const group = groups.get(word)
        if (group) group.push(m)
        else groups.set(word, [m])
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

/** Mines one bank's distinct masked sequences into templates, most frequent template first. */
export function mineSequences(sequences: Sequence[]): Template[] {
  return mine(sequences).sort((a, b) => messageCount(b) - messageCount(a))
}
