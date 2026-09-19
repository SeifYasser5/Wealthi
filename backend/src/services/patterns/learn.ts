import { createHash } from 'node:crypto'
import type { DecodedMessage } from '../../utils/types'
import { label, type Labelled } from './label'
import { mask } from './mask'
import { mineSequences } from './mine'

export type LearnedPattern = Labelled & { id: string }

/**
 * Learns one bank's transaction patterns from its messages: mask → mine → label.
 * Templates that aren't transactions are dropped. Ids hash the mined template,
 * so the same template keeps its id across runs.
 */
export function learnBank(bank: string, messages: DecodedMessage[]): LearnedPattern[] {
  // Messages sharing a masked sequence, keyed by that sequence, in first-seen order.
  const groups = new Map<string, { tokens: string[]; texts: string[] }>()
  for (const m of messages) {
    const tokens = mask(m.text)
    const key = tokens.join(' ')
    const group = groups.get(key)
    if (group) group.texts.push(m.text)
    else groups.set(key, { tokens, texts: [m.text] })
  }
  const sequences = [...groups.values()].map(({ tokens, texts }) => ({ tokens, count: texts.length }))

  const seen = new Map<string, number>()
  return mineSequences(sequences).flatMap((template) => {
    const texts = template.members.flatMap((s) => groups.get(s.tokens.join(' '))!.texts)
    const labelled = label(template, texts)
    if (!labelled) return []
    const hash = createHash('sha1').update(template.elements.join(' ')).digest('hex').slice(0, 10)
    const n = (seen.get(hash) ?? 0) + 1
    seen.set(hash, n)
    return [{ id: `${bank}:${hash}${n > 1 ? `-${n}` : ''}`, ...labelled }]
  })
}
