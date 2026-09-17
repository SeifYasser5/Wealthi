// Accounts are configured on the backend (config/wealthi.json) and served by
// GET /api/accounts — load them with useAccounts(), never hardcode them here.

/** One of your own account ids. */
export type AccountId = string

/** Mirrors the backend Account (backend/src/utils/config.ts). */
export interface Account {
  id: AccountId
  label: string
  currency: 'EGP' | 'USD'
}
