import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile, type PatternFile } from './pattern'

/** "ADCB Egypt" → "adcb-egypt" */
export function bankOf(sender: string): string {
  return sender
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Every pattern file in `dir`, validated: each pattern must compile. Only the
 * committed seed files are read this way (backend/demo/patterns, the test
 * fixtures); the app's own patterns live in the sms_patterns table.
 */
export function loadPatternFiles(dir: string): PatternFile[] {
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
