import { prisma } from './client'
import type { Prisma } from '@prisma/client'
import type { WealthiConfig } from '../utils/config'
import type { IngestSettings } from '../utils/types'
import { minorToDecimal, type Minor } from '../utils/money'
import { loadAccountSources, loadAccounts } from './accounts'
import { listBankSenders } from './bank-senders'
import { loadTransferRules } from './transfer-rules'

type Db = Prisma.TransactionClient

/** Config's seed keys for the settings tables. */
export type SettingsSeed = Pick<
  WealthiConfig,
  'bankSenders' | 'accounts' | 'accountSources' | 'openingBalances' | 'transferRules'
>

/**
 * Everything an import or a learn run reads from the settings tables, in one
 * snapshot taken at its start: an edit made on the Settings page mid-run
 * applies to the next one.
 */
export async function loadIngestSettings(db: Db = prisma): Promise<IngestSettings> {
  const [accounts, accountSources, transferRules, bankSenders] = await Promise.all([
    loadAccounts(db),
    loadAccountSources(db),
    loadTransferRules(db),
    listBankSenders(db),
  ])
  return { accounts, accountSources, transferRules, bankSenders }
}

/**
 * Copies config's accounts, sources, transfer rules and senders into their
 * tables, each only when that table is empty, so the Settings page's edits are
 * never overwritten and the config file is never changed. Accounts go first:
 * the others reference them. Returns how many rows were stored, all tables together.
 */
export async function seedSettings(seed: SettingsSeed, db: Db = prisma): Promise<number> {
  let stored = 0

  if ((await db.account.count()) === 0) {
    const { count } = await db.account.createMany({
      data: seed.accounts.map((a, position) => ({
        id: a.id,
        label: a.label || a.id,
        currency: a.currency,
        openingBalance: minorToDecimal(seed.openingBalances[a.id] ?? (0 as Minor)),
        position,
      })),
    })
    stored += count
  }

  // Only rows naming a stored account can be inserted; the loader already
  // pruned the rest of config, and these are the foreign keys' last word.
  if ((await db.accountSource.count()) === 0) {
    const { count } = await db.accountSource.createMany({
      data: Object.entries(seed.accountSources).map(([source, accountId]) => ({ source, accountId })),
    })
    stored += count
  }

  if ((await db.transferRule.count()) === 0) {
    const { count } = await db.transferRule.createMany({
      data: seed.transferRules.map((r) => ({
        accountId: r.account,
        type: r.type,
        merchant: r.merchant ?? '',
        counterAccountId: r.counterAccount,
      })),
      skipDuplicates: true,
    })
    stored += count
  }

  if ((await db.bankSender.count()) === 0) {
    const { count } = await db.bankSender.createMany({
      data: seed.bankSenders.map((sender) => ({ sender })),
      skipDuplicates: true,
    })
    stored += count
  }

  return stored
}

/** Replaces every settings table with config's — the demo's reset. */
export async function replaceSettings(seed: SettingsSeed): Promise<void> {
  await prisma.$transaction(async (db) => {
    await db.transferRule.deleteMany()
    await db.accountSource.deleteMany()
    await db.account.deleteMany()
    await db.bankSender.deleteMany()
    await seedSettings(seed, db)
  })
}
