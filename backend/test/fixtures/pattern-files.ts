import { resolve } from 'node:path'
import { createPatternParser } from '../../src/services/ingest/parser'
import { fixtureSettings } from './settings'
import type { PatternFile } from '../../src/services/patterns/pattern'
import { loadPatternFiles } from '../../src/services/patterns/store'

/** test/fixtures/patterns — the synthetic patterns the fixture ledger is parsed with. */
export const FIXTURE_PATTERNS_DIR = resolve(__dirname, 'patterns')

export const fixturePatterns = (): PatternFile[] => loadPatternFiles(FIXTURE_PATTERNS_DIR)

/** The parser an import builds once resetDatabase() has stored the fixture patterns. */
export const fixtureParser = createPatternParser(fixturePatterns(), fixtureSettings)
