import type { AccountId } from './accounts'

// Shape of a transaction as serialized by GET /api/transactions.
// Dates arrive as ISO strings over JSON.
export interface Transaction {
  id: string
  yearMonth: string
  type: 'debit' | 'credit'
  amount: number
  currency: 'EGP' | 'USD'
  account: AccountId
  merchant: string | null
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

export interface TransactionFilters {
  yearMonth?: string
  account?: AccountId
  merchant?: string
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

export interface SpendingResponse {
  yearMonth: string
  grandTotal: number
  categories: CategoryRow[]
  largeTransactions: LargeTransactionRow[]
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
