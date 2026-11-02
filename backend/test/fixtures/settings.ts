import { config } from '../../src/utils/config'
import { minorToNumber } from '../../src/utils/money'
import type { Account, IngestSettings } from '../../src/utils/types'

/** The fixture config's settings, as the tables hold them once resetDatabase() has seeded them. */
export const fixtureSettings: IngestSettings = {
  accounts: config.accounts.map((a) => ({ ...a, openingBalance: config.openingBalances[a.id] })),
  accountSources: config.accountSources,
  transferRules: config.transferRules.map((r) => ({
    account: r.account,
    type: r.type,
    merchant: r.merchant ?? '',
    counterAccount: r.counterAccount,
  })),
  bankSenders: config.bankSenders,
}

/** The fixture accounts as GET /api/accounts serves them. */
export const fixtureAccounts: Account[] = fixtureSettings.accounts.map((a) => ({
  ...a,
  openingBalance: minorToNumber(a.openingBalance),
}))
