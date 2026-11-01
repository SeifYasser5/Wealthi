import { seedCategories } from '../../src/db/categories'
import { prisma } from '../../src/db/client'
import { replacePatterns } from '../../src/db/patterns'
import { config } from '../../src/utils/config'
import { fixturePatterns } from '../fixtures/pattern-files'

/**
 * Empties every table, then stores the fixture patterns, which the importer
 * parses with, and the fixture config's categories, as the first start would —
 * unless `patterns: false` / `categories: false` leave those tables empty too.
 * Only ever reaches a *_test database (see setup/guard.ts).
 */
export async function resetDatabase({ patterns = true, categories = true } = {}): Promise<void> {
  await prisma.$transaction([
    prisma.monthlyBalance.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.schedule.deleteMany(),
    prisma.merchantCategory.deleteMany(),
    prisma.category.deleteMany(),
    prisma.importState.deleteMany(),
    prisma.smsPattern.deleteMany(),
  ])
  if (patterns) await replacePatterns(fixturePatterns())
  if (categories) await seedCategories(config)
}
