import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { PatternFile } from '../../src/services/patterns/pattern'
import { bankOf, loadPatternFiles } from '../../src/services/patterns/store'
import { FIXTURE_PATTERNS_DIR } from '../fixtures/pattern-files'

const file = (bank: string, pattern = 'Paid {amount:NUM}'): PatternFile => ({
  bank,
  patterns: [{ id: `${bank}:1`, enabled: true, type: 'debit', pattern, generated: pattern, reason: 'r', messages: 1 }],
})

function writeFiles(dir: string, files: PatternFile[]): void {
  mkdirSync(dir, { recursive: true })
  for (const f of files) writeFileSync(join(dir, `${f.bank}.json`), JSON.stringify(f))
}

describe('bankOf', () => {
  it('slugs a sender into a bank id', () => {
    expect(bankOf('  ADCB Egypt ')).toBe('adcb-egypt')
    expect(bankOf('CIB-Bank!!')).toBe('cib-bank')
    expect(bankOf('بنك مصر')).toBe('بنك-مصر')
  })
})

describe('loadPatternFiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wealthi-patterns-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('reads the committed fixtures', () => {
    expect(loadPatternFiles(FIXTURE_PATTERNS_DIR).map((f) => f.bank)).toEqual(['test-bank'])
  })

  it('is empty when the directory does not exist', () => {
    expect(loadPatternFiles(join(dir, 'nope'))).toEqual([])
  })

  it('returns the .json files sorted by name, ignoring other files', () => {
    const out = join(dir, 'order')
    writeFiles(out, [file('zeta'), file('alpha'), file('mid')])
    writeFileSync(join(out, 'NOTES.md'), '# not a pattern file')
    expect(loadPatternFiles(out)).toEqual([file('alpha'), file('mid'), file('zeta')])
  })

  it('refuses a file with a pattern that does not compile, naming it', () => {
    const out = join(dir, 'broken')
    writeFiles(out, [file('b', '{x:NOPE}')])
    expect(() => loadPatternFiles(out)).toThrow(/Invalid pattern b:1 in .*b\.json: unknown slot type "NOPE"/)
  })
})
