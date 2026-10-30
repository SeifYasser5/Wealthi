import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Account } from '@wealthi/shared'
import type { AccountId } from '../types'
import { z } from 'zod'
import { WealthiConfigSchema, pruneUnknownAccounts, type DroppedRef, type WealthiConfig } from './schema'

export type { CsvImport, ManualEntry, RecurringEntry, TransferRule, WealthiConfig } from './schema'

// WEALTHI_CONFIG_PATH points the app at another file — the test suite uses it
// to load a synthetic config instead of your real one.
export const CONFIG_PATH = resolve(
  process.env.WEALTHI_CONFIG_PATH ?? resolve(__dirname, '../../../config/wealthi.json'),
)

/**
 * Warn about references pruned from the loaded config.
 *
 * Deleting an account leaves references to it behind, and refusing to start
 * over a stale transfer rule is worse than dropping it. But two of these kinds
 * of entry feed the balance math, so the drop is never silent: the entry that
 * went, the account it named and what it cost all go to stderr.
 */
function warnDropped(dropped: DroppedRef[]): void {
  if (dropped.length === 0) return
  const accounts = [...new Set(dropped.map((d) => d.account))]
  const lines = dropped.map((d) => `  ${d.path} -> "${d.account}" (${d.effect})`)
  console.warn(
    `[config] ${CONFIG_PATH}: dropped ${dropped.length} ${dropped.length === 1 ? 'entry' : 'entries'} referencing ` +
      `${accounts.length} undeclared ${accounts.length === 1 ? 'account' : 'accounts'}:\n${lines.join('\n')}\n` +
      `[config] Add ${accounts.length === 1 ? 'it' : 'them'} back to "accounts", or remove the entries above. ` +
      `"no longer imported" entries were in the balance math, so balances will change.`,
  )
}

function load(): WealthiConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found at ${CONFIG_PATH}. Copy config/wealthi.example.json to config/wealthi.json.`)
  }
  const parsed = WealthiConfigSchema.safeParse(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid ${CONFIG_PATH}:\n${z.prettifyError(parsed.error)}`)
  const { config, dropped } = pruneUnknownAccounts(parsed.data)
  warnDropped(dropped)
  return config
}

export const config: WealthiConfig = load()

/** Your own accounts, in display order, as configured in config/wealthi.json. */
export const ACCOUNTS: Account[] = config.accounts

export const ALL_ACCOUNTS: AccountId[] = ACCOUNTS.map((a) => a.id)

export function isAccountId(value: string): value is AccountId {
  return ALL_ACCOUNTS.includes(value)
}

/**
 * The own account a parser source (e.g. "adcb:card") is mapped to in
 * config/wealthi.json accountSources, or undefined when it isn't mapped.
 */
export function accountFor(source: string): AccountId | undefined {
  return config.accountSources[source]
}
