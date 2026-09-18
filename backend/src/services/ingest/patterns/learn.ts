import { createHash } from 'node:crypto'
import type { DecodedMessage } from '../../../utils/types'
import { label } from './label'
import { mask } from './mask'
import { mineTokens } from './mine'
import type { LearnedPattern } from './store'

/**
 * Learns one bank's transaction patterns from its messages: mask → mine → label.
 * Templates that aren't transactions are dropped. Ids hash the mined template,
 * so the same template keeps its id across runs.
 */
export function learnBank(bank: string, messages: DecodedMessage[]): LearnedPattern[] {
  const textsBySequence = new Map<string, string[]>()
  const tokenLists = messages.map((m) => {
    const tokens = mask(m.text)
    const key = tokens.join(' ')
    textsBySequence.set(key, [...(textsBySequence.get(key) ?? []), m.text])
    return tokens
  })

  const seen = new Map<string, number>()
  return mineTokens(tokenLists).flatMap((template) => {
    const texts = template.members.flatMap((s) => textsBySequence.get(s.tokens.join(' ')) ?? [])
    const labelled = label(template, texts)
    if (!labelled) return []
    const hash = createHash('sha1').update(template.elements.join(' ')).digest('hex').slice(0, 10)
    const n = (seen.get(hash) ?? 0) + 1
    seen.set(hash, n)
    return [{ id: `${bank}:${hash}${n > 1 ? `-${n}` : ''}`, ...labelled }]
  })
}
