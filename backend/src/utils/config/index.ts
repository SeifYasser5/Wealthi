import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Account } from '@wealthi/shared'
import type { AccountId } from '../types'
import type { WealthiConfig } from './types'
import { ConfigError, validate } from '../validation/config'

export type { CsvImport, ManualEntry, RecurringEntry, WealthiConfig } from './types'

export const CONFIG_PATH = resolve(__dirname, '../../../config/wealthi.json')

function load(): WealthiConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found at ${CONFIG_PATH}. Copy config/wealthi.example.json to config/wealthi.json.`)
  }
  try {
    return validate(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  } catch (err) {
    if (err instanceof ConfigError) throw new Error(`Invalid ${CONFIG_PATH}: ${err.message}`)
    throw err
  }
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
