import { config, type Account } from './config'
import type { AccountId } from './types'

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
