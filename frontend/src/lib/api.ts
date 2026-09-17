import type { Account, AccountId } from './accounts'

// Shape of a transaction as serialized by GET /api/transactions.
// Dates arrive as ISO strings over JSON.
export interface Transaction {
  id: string
  yearMonth: string
  type: TransactionType
  amount: number
  currency: 'EGP' | 'USD'
  account: AccountId
  merchant: string | null
  /** Manually assigned category; null means the backend merchant map decides. */
  category: string | null
  counterAccount: AccountId | null
  reportedBalance: number | null
  transactedAt: string | null
  createdAt: string
  isTransfer: boolean
  raw: string
}

export interface TransactionsResponse {
  count: number
  transactions: Transaction[]
}

/** Mirrors the backend TransferFilter (backend/src/db/transactions.ts). */
export type TransferFilter = 'only' | 'exclude'

/** Direction of a transaction: debit = money out, credit = money in. */
export type TransactionType = 'debit' | 'credit'

export interface TransactionFilters {
  yearMonth?: string
  account?: AccountId
  merchant?: string
  type?: TransactionType
  /** 'only' keeps internal transfers; 'exclude' keeps everything else. */
  transfer?: TransferFilter
  /** The other side of an internal transfer. Implies `transfer: 'only'`. */
  counterAccount?: AccountId
}

/** Fetches transactions from the backend, applying any provided filters. */
export async function fetchTransactions(
  filters: TransactionFilters,
  signal?: AbortSignal,
): Promise<TransactionsResponse> {
  const params = new URLSearchParams()
  if (filters.yearMonth) params.set('yearMonth', filters.yearMonth)
  if (filters.account) params.set('account', filters.account)
  if (filters.merchant) params.set('merchant', filters.merchant)
  if (filters.type) params.set('type', filters.type)
  if (filters.transfer) params.set('transfer', filters.transfer)
  // The backend rejects this pairing outright, so never put it on the wire.
  if (filters.counterAccount && filters.transfer !== 'exclude') {
    params.set('counterAccount', filters.counterAccount)
  }

  const query = params.toString()
  const res = await fetch(`/api/transactions${query ? `?${query}` : ''}`, { signal })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<TransactionsResponse>
}

// Shape of a monthly balance snapshot as serialized by GET /api/balances.
// Mirrors the backend AccountBalance (backend/src/utils/types.ts).
export interface AccountBalance {
  account: AccountId
  yearMonth: string
  openingBalance: number
  debits: number
  credits: number
  transfersIn: number
  transfersOut: number
  closingBalance: number
  lastReportedBalance: number | null
  discrepancy: number | null
}

export interface BalancesResponse {
  yearMonth: string
  count: number
  balances: AccountBalance[]
}

/** Fetches the per-account balance snapshots for one month. */
export async function fetchBalances(yearMonth: string, signal?: AbortSignal): Promise<BalancesResponse> {
  const params = new URLSearchParams({ yearMonth })
  const res = await fetch(`/api/balances?${params.toString()}`, { signal })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<BalancesResponse>
}

export interface MerchantRow {
  merchant: string
  total: number
}

export interface CategoryRow {
  category: string
  total: number
  merchants: MerchantRow[]
}

export interface LargeTransactionRow {
  id: string
  merchant: string | null
  amount: number
  account: string
  pct: number
}

/** An uncategorized transaction, addressable by id so it can be assigned a category. */
export interface UncategorizedTransactionRow {
  id: string
  merchant: string | null
  amount: number
  account: string
  transactedAt: string
  pct: number
}

export interface SpendingResponse {
  yearMonth: string
  grandTotal: number
  categories: CategoryRow[]
  largeTransactions: LargeTransactionRow[]
  /** Uncategorized rows not already promoted into `largeTransactions`. */
  uncategorized: UncategorizedTransactionRow[]
}

/** Fetches debit spending grouped by category → merchant for one month. */
export async function fetchSpending(yearMonth: string, signal?: AbortSignal): Promise<SpendingResponse> {
  const params = new URLSearchParams({ yearMonth })
  const res = await fetch(`/api/spending?${params.toString()}`, { signal })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<SpendingResponse>
}

export interface AccountsResponse {
  /** Your accounts in display order, with the label and currency to show. */
  accounts: Account[]
}

/** Fetches the configured account list. */
export async function fetchAccounts(signal?: AbortSignal): Promise<AccountsResponse> {
  const res = await fetch('/api/accounts', { signal })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<AccountsResponse>
}

export interface CategoriesResponse {
  /** Assignable categories — the exact set the PATCH endpoint accepts. */
  categories: string[]
  /** Label for rows with no category; not assignable. */
  uncategorized: string
}

/** Fetches the category vocabulary that populates the category dropdowns. */
export async function fetchCategories(signal?: AbortSignal): Promise<CategoriesResponse> {
  const res = await fetch('/api/categories', { signal })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<CategoriesResponse>
}

/** Assigns a category to one transaction, or clears it when `category` is null. */
export async function updateTransactionCategory(
  id: string,
  category: string | null,
): Promise<{ transaction: Transaction }> {
  const res = await fetch(`/api/transactions/${id}/category`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<{ transaction: Transaction }>
}
