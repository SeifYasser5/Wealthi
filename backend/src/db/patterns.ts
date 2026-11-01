import { prisma } from './client'
import type { Prisma, SmsPattern } from '@prisma/client'
import type { LearnedPattern } from '../services/patterns/learn'
import type { Pattern, PatternFile } from '../services/patterns/pattern'
import type { PatternRow, PatternType } from '../utils/types'

// Most-used first; patterns the latest learn run didn't produce go last.
const ORDER: Prisma.SmsPatternOrderByWithRelationInput[] = [{ missing: 'asc' }, { messages: 'desc' }, { id: 'asc' }]

function toRow(p: SmsPattern): PatternRow {
  return {
    id: p.id,
    bank: p.bank,
    status: p.status,
    // Only learn and replacePatterns write `type`, both from a Pattern's type.
    type: p.type as PatternType,
    pattern: p.pattern,
    reason: p.reason,
    review: p.review,
    messages: p.messages,
    missing: p.missing,
    learnedAt: p.learnedAt.toISOString(),
  }
}

/** Every stored pattern, for the Learn page. */
export async function listPatterns(): Promise<PatternRow[]> {
  return (await prisma.smsPattern.findMany({ orderBy: ORDER })).map(toRow)
}

/** The enabled patterns grouped by bank — what the importer builds its parser from. */
export async function loadEnabledPatterns(): Promise<PatternFile[]> {
  const rows = await prisma.smsPattern.findMany({ where: { status: 'enabled' }, orderBy: ORDER })
  const byBank = new Map<string, Pattern[]>()
  for (const r of rows) {
    const pattern: Pattern = {
      id: r.id,
      enabled: true,
      type: r.type as PatternType,
      pattern: r.pattern,
      generated: r.generated,
      reason: r.reason,
      messages: r.messages,
    }
    const patterns = byBank.get(r.bank)
    if (patterns) patterns.push(pattern)
    else byBank.set(r.bank, [pattern])
  }
  return [...byBank].map(([bank, patterns]) => ({ bank, patterns }))
}

/**
 * Stores one learn run, per bank, without losing your review:
 * - a pattern not stored yet is added `pending`;
 * - a stored one keeps its status, type and pattern text; only `generated`,
 *   `reason`, `review` and `messages` are refreshed;
 * - a stored one of the same bank this run didn't produce is marked `missing`.
 * Banks absent from the run are left alone. Returns how many were added.
 */
export async function storeLearned(byBank: Map<string, LearnedPattern[]>): Promise<number> {
  return prisma.$transaction(
    async (db) => {
      let added = 0
      for (const [bank, learned] of byBank) {
        const ids = learned.map((l) => l.id)
        const stored = new Set(
          (await db.smsPattern.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id),
        )
        const fresh = learned.filter((l) => !stored.has(l.id))
        added += fresh.length

        await db.smsPattern.createMany({
          data: fresh.map((l) => ({
            id: l.id,
            bank,
            status: 'pending' as const,
            type: l.type,
            pattern: l.pattern,
            generated: l.pattern,
            reason: l.reason,
            review: l.review ?? [],
            messages: l.messages,
          })),
        })
        for (const l of learned.filter((l) => stored.has(l.id))) {
          await db.smsPattern.update({
            where: { id: l.id },
            data: {
              generated: l.pattern,
              reason: l.reason,
              review: l.review ?? [],
              messages: l.messages,
              missing: false,
            },
          })
        }
        await db.smsPattern.updateMany({
          where: { bank, id: { notIn: ids } },
          data: { messages: 0, missing: true },
        })
      }
      return added
    },
    { timeout: 60_000 },
  )
}

/**
 * Enables and disables patterns by id, all or nothing. Returns the ids that
 * aren't stored — when there are any, nothing was changed.
 */
export async function setPatternStatus(enable: string[], disable: string[]): Promise<string[]> {
  return prisma.$transaction(async (db) => {
    const ids = [...enable, ...disable]
    const found = new Set(
      (await db.smsPattern.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id),
    )
    const unknown = ids.filter((id) => !found.has(id))
    if (unknown.length > 0) return unknown

    await db.smsPattern.updateMany({ where: { id: { in: enable } }, data: { status: 'enabled' } })
    await db.smsPattern.updateMany({ where: { id: { in: disable } }, data: { status: 'disabled' } })
    return []
  })
}

/**
 * Replaces every stored pattern with the files' — the demo's seed and the
 * tests' fixtures. `enabled` becomes status enabled, anything else disabled.
 */
export async function replacePatterns(files: PatternFile[]): Promise<void> {
  await prisma.$transaction([
    prisma.smsPattern.deleteMany(),
    prisma.smsPattern.createMany({
      data: files.flatMap(({ bank, patterns }) =>
        patterns.map((p) => ({
          id: p.id,
          bank,
          status: p.enabled ? ('enabled' as const) : ('disabled' as const),
          type: p.type,
          pattern: p.pattern,
          generated: p.generated,
          reason: p.reason,
          review: p.review ?? [],
          messages: p.messages,
          missing: p.missing ?? false,
        })),
      ),
    }),
  ])
}

/** Stored patterns of any bank but `bank` — the demo seed refuses to replace them. */
export async function countPatternsOutside(bank: string): Promise<number> {
  return prisma.smsPattern.count({ where: { bank: { not: bank } } })
}
