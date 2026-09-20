/**
 * Mining — groups one bank's masked token sequences into templates by token
 * count, and is what `learn.ts` runs.
 *
 * `mine2.ts` holds the older LCS variant, which handles templates this one
 * cannot but is harder to predict. This one was measured against it on real
 * messages from three banks and reproduced every pattern that carries money.
 *
 * The assumption it is built on: within one template exactly **one** run of
 * tokens varies (the shop / counterparty), so two messages of the same template
 * and the same token count differ in one contiguous stretch and nowhere else.
 *
 * 1. Bucket sequences by token count. Inside a bucket every message lines up
 *    index to index, so no LCS and no similarity threshold: the positions where
 *    two sequences differ *are* the slot. A diff that isn't one contiguous run
 *    means a second thing varies, so the merge is refused and the sequences stay
 *    apart — which is what keeps "debited" and "credited" in separate templates
 *    when they happen to share a token count.
 * 2. Merge buckets: two templates that agree on a prefix and a suffix and differ
 *    only in the middle are the same template with a wider slot, so the 1-word
 *    shop bucket and the 3-word shop bucket collapse into one.
 *
 * 3. Split variants, as mine2.ts does: step 2 merges buckets that differ in the
 *    middle without knowing whether the middle is free text or a template word,
 *    so a slot whose edge word takes 2-3 well-supported values ("transfer to …"
 *    vs "payment …") is a variant and its template is mined again per value.
 *
 * 4. Rescue the small buckets: a template built from one or two message shapes
 *    saw no variation, so its shop or counterparty is still literal text. If a
 *    bigger template's slot covers those messages, they move there instead.
 *
 * At every step a slot may never swallow a <CUR>, <DATE>, <TIME>, <URL> or an
 * account number, so an amount can't leak into a merchant.
 */

import { isPlaceholder, PUNCT } from './mask'

export const SLOT = '<TEXT>'

export interface Sequence {
  tokens: string[]
  /** Messages with exactly this masked sequence */
  count: number
}

export interface Template {
  elements: string[]
  members: Sequence[]
}

export const messageCount = (t: Template) => t.members.reduce((sum, m) => sum + m.count, 0)

const BLOCKING = new Set(['<CUR>', '<DATE>', '<TIME>', '<URL>'])
/** A <MASKED> after one of these is an account/reference, which a slot must not swallow. */
const ACCOUNT_CONTEXT = /^(ending|account|card|card\/account|no|id|ref|حساب|بطاقه|بطاقة|بـرقم)$/i
/** An all-digit reference masks as <NUM>, so the two align with each other. */
const REFERENCE = new Set(['<NUM>', '<ID>'])

/** Literal words a template must keep outside its slot. */
const MIN_ANCHORS = 2
/** A slot edge word with at most this many distinct values is a variant. */
const MAX_VARIANTS = 3
/** Distinct sequences each variant needs before a split is trusted. */
const MIN_VARIANT_SUPPORT = 2
const MAX_DEPTH = 8
/** A slot may cover at most this share of a message, so two unrelated templates can't merge into one slot. */
const MAX_SLOT_SHARE = 0.5

/** Token index range [from, to) a slot covers. */
type Range = [number, number]

const isLiteral = (t: string) => !isPlaceholder(t)
const same = (a: string, b: string) => a === b || (REFERENCE.has(a) && REFERENCE.has(b))
/** The token covering both, for a position where `same` holds. */
const unify = (a: string, b: string) => (a === b ? a : '<ID>')
const inRange = (range: Range | null, i: number) => range !== null && i >= range[0] && i < range[1]

/** Whether seq[k] may not become part of a slot. */
function blocksSlot(seq: string[], k: number): boolean {
  if (BLOCKING.has(seq[k])) return true
  if (seq[k] !== '<MASKED>') return false
  for (let i = k - 1; i >= 0; i--) if (!PUNCT.test(seq[i])) return ACCOUNT_CONTEXT.test(seq[i])
  return true
}

/** Whether any of seq[from..to) may not become part of a slot. */
function rangeBlocks(seq: string[], [from, to]: Range): boolean {
  for (let k = from; k < to; k++) if (blocksSlot(seq, k)) return true
  return false
}

/** Whether a slot over `range` is allowed in a template of `elements` covering `tokens`. */
function allows(elements: string[], tokens: string[], range: Range | null): boolean {
  if (!range) return true
  const width = range[1] - range[0]
  if (width > Math.min(elements.length, tokens.length) * MAX_SLOT_SHARE) return false
  if (rangeBlocks(elements, range) || rangeBlocks(tokens, range)) return false
  return elements.filter((t, i) => !inRange(range, i) && isLiteral(t)).length >= MIN_ANCHORS
}

// ---------------------------------------------------------------------------
// 1. Inside one length bucket
// ---------------------------------------------------------------------------

interface Cluster {
  /** One entry per token position; positions inside `slot` hold SLOT. */
  elements: string[]
  slot: Range | null
  members: Sequence[]
}

/**
 * The slot `tokens` needs to join the cluster: the cluster's own slot when they
 * already agree everywhere else, or that slot widened over the differing
 * positions. Null when the differences aren't one contiguous run, i.e. when
 * more than one thing varies.
 */
function runFor(cluster: Cluster, tokens: string[]): { range: Range | null } | null {
  const differs: boolean[] = []
  let first = -1
  let last = -1
  for (let i = 0; i < tokens.length; i++) {
    differs[i] = !inRange(cluster.slot, i) && !same(cluster.elements[i], tokens[i])
    if (!differs[i]) continue
    if (first < 0) first = i
    last = i
  }
  if (first < 0) return { range: cluster.slot }

  const from = Math.min(first, cluster.slot?.[0] ?? first)
  const to = Math.max(last + 1, cluster.slot?.[1] ?? 0)
  // One run only: everything between the outermost differences must itself be a
  // difference or already inside the slot, never a template word in between.
  for (let i = from; i < to; i++) if (!differs[i] && !inRange(cluster.slot, i)) return null
  return { range: [from, to] }
}

function clusterBucket(sequences: Sequence[]): Cluster[] {
  const clusters: Cluster[] = []
  for (const seq of sequences) {
    const home = clusters.find((c) => {
      const run = runFor(c, seq.tokens)
      return run !== null && allows(c.elements, seq.tokens, run.range)
    })
    if (!home) {
      clusters.push({ elements: [...seq.tokens], slot: null, members: [seq] })
      continue
    }
    const { range } = runFor(home, seq.tokens)!
    home.elements = home.elements.map((e, i) => (inRange(range, i) ? SLOT : unify(e, seq.tokens[i])))
    home.slot = range
    home.members.push(seq)
  }
  return clusters
}

/** A cluster's positional elements as a template: the slot's positions become one SLOT. */
function collapse({ elements, slot, members }: Cluster): Template {
  return {
    elements: slot ? [...elements.slice(0, slot[0]), SLOT, ...elements.slice(slot[1])] : [...elements],
    members,
  }
}

// ---------------------------------------------------------------------------
// 2. Across buckets
// ---------------------------------------------------------------------------

/**
 * Whether both middles hold the same literal word. Two shop names of different
 * widths have nothing in common; a word in both is a template word the merge
 * would swallow ("… transfer to NAME ref <ID>" vs "… payment SHOP ref <ID>"
 * share "ref"), which means two things vary here, not one slot of two widths.
 */
function sharesLiteral(midA: string[], midB: string[]): boolean {
  const literals = new Set(midA.filter(isLiteral))
  return midB.some((t) => isLiteral(t) && literals.has(t))
}

/**
 * The template covering both element lists when they share a prefix and a
 * suffix and differ only in the middle — the same template with the slot a
 * different number of tokens wide. Null when they can't be one template.
 */
function widen(a: string[], b: string[]): string[] | null {
  const shortest = Math.min(a.length, b.length)
  let p = 0
  while (p < shortest && a[p] !== SLOT && same(a[p], b[p])) p++
  let s = 0
  while (s < shortest - p && a[a.length - 1 - s] !== SLOT && same(a[a.length - 1 - s], b[b.length - 1 - s])) s++

  const midA: Range = [p, a.length - s]
  const midB: Range = [p, b.length - s]
  const empty = midA[0] === midA[1] && midB[0] === midB[1]
  if (!empty && (!allows(a, a, midA) || !allows(b, b, midB))) return null
  if (!empty && sharesLiteral(a.slice(...midA), b.slice(...midB))) return null

  const prefix = a.slice(0, p).map((t, i) => unify(t, b[i]))
  const suffix = a.slice(a.length - s).map((t, i) => unify(t, b[b.length - s + i]))
  return empty ? [...prefix, ...suffix] : [...prefix, SLOT, ...suffix]
}

/** Merges templates whose slot is only a different width, widest template first, until nothing changes. */
function mergeBuckets(templates: Template[]): Template[] {
  let out = templates
  for (let pass = 0; pass < out.length; pass++) {
    const merged: Template[] = []
    for (const t of out) {
      // Prefer the merge that keeps the most literal words, as the parser prefers the most literal pattern.
      let best: { into: Template; elements: string[]; literals: number } | null = null
      for (const into of merged) {
        const elements = widen(into.elements, t.elements)
        if (!elements) continue
        const literals = elements.filter(isLiteral).length
        if (!best || literals > best.literals) best = { into, elements, literals }
      }
      if (!best) merged.push({ elements: [...t.elements], members: [...t.members] })
      else {
        best.into.elements = best.elements
        best.into.members.push(...t.members)
      }
    }
    if (merged.length === out.length) return merged
    out = merged
  }
  return out
}

// ---------------------------------------------------------------------------
// 3. Variant splitting
// ---------------------------------------------------------------------------

/** What each member puts in the template's slot. A v2 template has at most one. */
function slotValues(template: Template): string[][] {
  const at = template.elements.indexOf(SLOT)
  if (at < 0) return []
  const after = template.elements.length - at - 1
  return template.members.map((m) => m.tokens.slice(at, m.tokens.length - after))
}

const firstWord = (value: string[]) => value[0]
const lastWord = (value: string[]) => value[value.length - 1]

/** Members grouped by the first/last word of the slot, when that word has few well-supported values. */
function variantSplit(template: Template): Sequence[][] | null {
  const values = slotValues(template)
  if (!values.length) return null

  for (const edge of [firstWord, lastWord]) {
    const groups = new Map<string, Sequence[]>()
    template.members.forEach((m, i) => {
      const word = edge(values[i]) ?? '∅'
      const group = groups.get(word)
      if (group) group.push(m)
      else groups.set(word, [m])
    })
    const parts = [...groups.values()]
    if (parts.length >= 2 && parts.length <= MAX_VARIANTS && parts.every((p) => p.length >= MIN_VARIANT_SUPPORT))
      return parts
  }
  return null
}

// ---------------------------------------------------------------------------
// 4. Rescuing what a bucket was too small to see
// ---------------------------------------------------------------------------

/** Message shapes a template needs before its free text can be trusted to vary. */
const MIN_SHAPES = 3

/**
 * Whether a template element covers a token, by what the compiled pattern will
 * accept rather than by what masking produced. An <ID> slot matches any Latin
 * alphanumeric word, while masking only marks one that mixes letters and digits
 * — so an all-letter reference stays a literal token here and still parses.
 */
const ID_VALUE = /^[A-Za-z0-9]+$/
const covers = (element: string, token: string) => same(element, token) || (element === '<ID>' && ID_VALUE.test(token))

/** Whether `tokens` fit a template's prefix and suffix, with a slot fill no rule blocks. */
function fitsSlot(elements: string[], at: number, tokens: string[]): boolean {
  const after = elements.length - at - 1
  if (tokens.length < elements.length - 1) return false
  for (let i = 0; i < at; i++) if (!covers(elements[i], tokens[i])) return false
  for (let k = 1; k <= after; k++) if (!covers(elements[elements.length - k], tokens[tokens.length - k])) return false
  return !rangeBlocks(tokens, [at, tokens.length - after])
}

/** The most specific template whose slot covers every one of the orphan's members. */
function homeFor(templates: Template[], orphan: Template): Template | null {
  let best: { template: Template; literals: number } | null = null
  for (const template of templates) {
    const at = template.elements.indexOf(SLOT)
    if (at < 0 || messageCount(template) <= messageCount(orphan)) continue
    if (!orphan.members.every((m) => fitsSlot(template.elements, at, m.tokens))) continue
    // Prefer the template that keeps the most literal words, as the parser prefers the most literal pattern.
    const literals = template.elements.filter(isLiteral).length
    if (!best || literals > best.literals) best = { template, literals }
  }
  return best?.template ?? null
}

/**
 * Moves a template seen in only a shape or two into a bigger template whose slot
 * already covers it. Two messages carrying the same shop or the same name show
 * no variation at all, so that text would otherwise stay in the template as
 * literal words — a pattern that only ever matches that one shop or person.
 * Nothing about the bigger template changes, so its id is untouched.
 */
function rescue(templates: Template[]): Template[] {
  const kept: Template[] = []
  for (const template of templates) {
    const home = template.members.length < MIN_SHAPES ? homeFor(kept, template) : null
    if (home) home.members.push(...template.members)
    else kept.push(template)
  }
  return kept
}

/** Mines one bank's distinct masked sequences into templates, most frequent template first. */
export function mineSequences(sequences: Sequence[]): Template[] {
  const templates = mine(sequences).sort((a, b) => messageCount(b) - messageCount(a))
  return rescue(templates).sort((a, b) => messageCount(b) - messageCount(a))
}

function mine(sequences: Sequence[], depth = 0): Template[] {
  const buckets = new Map<number, Sequence[]>()
  for (const seq of [...sequences].sort(
    (a, b) => b.count - a.count || a.tokens.join(' ').localeCompare(b.tokens.join(' ')),
  )) {
    const bucket = buckets.get(seq.tokens.length)
    if (bucket) bucket.push(seq)
    else buckets.set(seq.tokens.length, [seq])
  }

  const templates = [...buckets.values()].flatMap((bucket) => clusterBucket(bucket).map(collapse))
  const merged = mergeBuckets(templates.sort((a, b) => messageCount(b) - messageCount(a)))

  return merged.flatMap((template) => {
    const parts = depth < MAX_DEPTH ? variantSplit(template) : null
    return parts ? parts.flatMap((part) => mine(part, depth + 1)) : [template]
  })
}
