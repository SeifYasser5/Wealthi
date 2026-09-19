import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile, type Pattern, type PatternFile } from './pattern'
import type { LearnedPattern } from './learn'

/** config/patterns/<bank>.json — gitignored, next to config/wealthi.json */
export const PATTERNS_DIR = resolve(__dirname, '../../../config/patterns')

/** "ADCB Egypt" → "adcb-egypt" */
export function bankOf(sender: string): string {
  return sender
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

/** Every pattern file, validated: each pattern must compile. */
export function loadPatternFiles(dir = PATTERNS_DIR): PatternFile[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const path = resolve(dir, name)
      const file = JSON.parse(readFileSync(path, 'utf8')) as PatternFile
      for (const p of file.patterns) {
        try {
          compile(p.pattern)
        } catch (error) {
          throw new Error(`Invalid pattern ${p.id} in ${path}: ${(error as Error).message}`)
        }
      }
      return file
    })
}

export function savePatternFile(file: PatternFile, dir = PATTERNS_DIR): string {
  mkdirSync(dir, { recursive: true })
  const path = resolve(dir, `${file.bank}.json`)
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n')
  return path
}

export interface MergeResult {
  file: PatternFile
  added: number
  missing: number
}

/**
 * Merges a learn run into the existing file without losing your work:
 * - a pattern you already have keeps `enabled`, `type` and `pattern`;
 *   only `generated`, `reason`, `review` and `messages` are refreshed, so
 *   `pattern` vs `generated` shows what learn would produce today. Delete a
 *   pattern from the file to take the fresh version.
 * - a new pattern is added disabled.
 * - a pattern this run didn't produce is kept and marked `missing`.
 * Order: by message count; missing ones last.
 */
export function mergePatterns(
  existing: PatternFile | undefined,
  bank: string,
  senders: string[],
  learned: LearnedPattern[],
): MergeResult {
  const previous = new Map((existing?.patterns ?? []).map((p) => [p.id, p]))
  let added = 0

  const current: Pattern[] = learned.map((l) => {
    const old = previous.get(l.id)
    previous.delete(l.id)
    if (!old) added++
    return {
      id: l.id,
      enabled: old?.enabled ?? false,
      type: old?.type ?? l.type,
      pattern: old?.pattern ?? l.pattern,
      generated: l.pattern,
      reason: l.reason,
      ...(l.review ? { review: l.review } : {}),
      messages: l.messages,
    }
  })
  const missing = [...previous.values()].map((p) => ({ ...p, messages: 0, missing: true as const }))

  const patterns = [...current, ...missing].sort(
    (a, b) => Number(!!a.missing) - Number(!!b.missing) || b.messages - a.messages,
  )
  const allSenders = [...new Set([...(existing?.senders ?? []), ...senders])]
  return { file: { bank, senders: allSenders, patterns }, added, missing: missing.length }
}
