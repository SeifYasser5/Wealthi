import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { LearnedPattern } from '../../src/services/patterns/learn'
import type { PatternFile } from '../../src/services/patterns/pattern'
import {
  bankOf,
  loadPatternFiles,
  mergePatterns,
  PATTERNS_DIR,
  savePatternFile,
} from '../../src/services/patterns/store'

const learned = (id: string, messages: number, over: Partial<LearnedPattern> = {}): LearnedPattern => ({
  id,
  type: 'debit',
  pattern: `Paid {amount:NUM} ${id}`,
  reason: 'r',
  messages,
  ...over,
})

describe('bankOf', () => {
  it('slugs a sender into a bank id', () => {
    expect(bankOf('  ADCB Egypt ')).toBe('adcb-egypt')
    expect(bankOf('CIB-Bank!!')).toBe('cib-bank')
    expect(bankOf('بنك مصر')).toBe('بنك-مصر')
  })
})

describe('pattern files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wealthi-patterns-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('reads from WEALTHI_PATTERNS_DIR', () => {
    expect(PATTERNS_DIR).toBe(resolve(__dirname, '../fixtures/patterns'))
    expect(loadPatternFiles().map((f) => f.bank)).toEqual(['test-bank'])
  })

  it('is empty when the directory does not exist', () => {
    expect(loadPatternFiles(join(dir, 'nope'))).toEqual([])
  })

  it('saves pretty JSON with a trailing newline and loads it back, ignoring other files', () => {
    const out = join(dir, 'roundtrip')
    const file: PatternFile = {
      bank: 'b',
      senders: ['B'],
      patterns: [{ ...learned('b:1', 1), enabled: true, generated: 'x' }],
    }
    const path = savePatternFile(file, out)
    expect(path).toBe(join(out, 'b.json'))
    expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(file, null, 2) + '\n')
    writeFileSync(join(out, 'NOTES.md'), '# not a pattern file')
    expect(loadPatternFiles(out)).toEqual([file])
  })

  it('refuses a file with a pattern that does not compile, naming it', () => {
    const out = join(dir, 'broken')
    savePatternFile(
      {
        bank: 'b',
        senders: [],
        patterns: [{ ...learned('b:bad', 1), pattern: '{x:NOPE}', enabled: false, generated: '' }],
      },
      out,
    )
    expect(() => loadPatternFiles(out)).toThrow(/Invalid pattern b:bad in .*b\.json: unknown slot type "NOPE"/)
  })
})

describe('mergePatterns', () => {
  it('starts a new file with every pattern disabled and generated = pattern', () => {
    const { file, added, missing } = mergePatterns(
      undefined,
      'b',
      ['B'],
      [learned('b:1', 3, { review: ['seen once'] })],
    )
    expect({ added, missing }).toEqual({ added: 1, missing: 0 })
    expect(file).toEqual({
      bank: 'b',
      senders: ['B'],
      patterns: [
        {
          id: 'b:1',
          enabled: false,
          type: 'debit',
          pattern: 'Paid {amount:NUM} b:1',
          generated: 'Paid {amount:NUM} b:1',
          reason: 'r',
          review: ['seen once'],
          messages: 3,
        },
      ],
    })
    expect('review' in mergePatterns(undefined, 'b', [], [learned('b:2', 1)]).file.patterns[0]).toBe(false)
  })

  it('keeps enabled, type and pattern from your file but refreshes the rest', () => {
    const existing = mergePatterns(undefined, 'b', ['B'], [learned('b:1', 1)]).file
    existing.patterns[0] = { ...existing.patterns[0], enabled: true, type: 'by-keyword', pattern: 'edited' }
    const { file } = mergePatterns(
      existing,
      'b',
      ['B2'],
      [learned('b:1', 9, { pattern: 'new generated', reason: 'why' })],
    )
    expect(file.senders).toEqual(['B', 'B2'])
    expect(file.patterns[0]).toMatchObject({
      enabled: true,
      type: 'by-keyword',
      pattern: 'edited',
      generated: 'new generated',
      reason: 'why',
      messages: 9,
    })
  })

  it('orders by message count with missing patterns last', () => {
    const existing = mergePatterns(undefined, 'b', ['B'], [learned('b:gone', 100), learned('b:1', 1)]).file
    const { file, missing } = mergePatterns(existing, 'b', ['B'], [learned('b:1', 1), learned('b:2', 5)])
    expect(missing).toBe(1)
    expect(file.patterns.map((p) => [p.id, p.messages, p.missing ?? false])).toEqual([
      ['b:2', 5, false],
      ['b:1', 1, false],
      ['b:gone', 0, true],
    ])
  })
})

describe('loadPatternFiles order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wealthi-order-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('returns files sorted by name', () => {
    for (const bank of ['zeta', 'alpha', 'mid']) savePatternFile({ bank, senders: [], patterns: [] }, dir)
    expect(loadPatternFiles(dir).map((f) => f.bank)).toEqual(['alpha', 'mid', 'zeta'])
  })
})
