import type {
  AccountsResponse,
  ApiError,
  BalancesResponse,
  CategoriesResponse,
  SpendingResponse,
  TransactionFilters,
  TransactionsResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
} from '@wealthi/shared'

/**
 * Calls the backend and returns the parsed JSON body.
 *
 * Every endpoint reports failure the same way — `{ error }` with a non-2xx
 * status — so unwrapping it lives here instead of in each fetcher.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }

  return res.json() as Promise<T>
}

/** Fetches transactions from the backend, applying any provided filters. */
export function fetchTransactions(filters: TransactionFilters, signal?: AbortSignal): Promise<TransactionsResponse> {
  const params = new URLSearchParams()
  const { counterAccount, ...rest } = filters

  for (const [key, value] of Object.entries(rest)) {
    if (value) params.set(key, value)
  }
  // The backend rejects this pairing outright, so never put it on the wire.
  if (counterAccount && filters.transfer !== 'exclude') params.set('counterAccount', counterAccount)

  const query = params.toString()
  return apiFetch<TransactionsResponse>(`/api/transactions${query ? `?${query}` : ''}`, { signal })
}

/** Fetches the per-account balance snapshots for one month. */
export function fetchBalances(yearMonth: string, signal?: AbortSignal): Promise<BalancesResponse> {
  return apiFetch<BalancesResponse>(`/api/balances?${new URLSearchParams({ yearMonth })}`, { signal })
}

/** Fetches debit spending grouped by category → merchant for one month. */
export function fetchSpending(yearMonth: string, signal?: AbortSignal): Promise<SpendingResponse> {
  return apiFetch<SpendingResponse>(`/api/spending?${new URLSearchParams({ yearMonth })}`, { signal })
}

/** Fetches the configured account list. */
export function fetchAccounts(signal?: AbortSignal): Promise<AccountsResponse> {
  return apiFetch<AccountsResponse>('/api/accounts', { signal })
}

/** Fetches the category vocabulary that populates the category dropdowns. */
export function fetchCategories(signal?: AbortSignal): Promise<CategoriesResponse> {
  return apiFetch<CategoriesResponse>('/api/categories', { signal })
}

/** Assigns a category to one transaction, or clears it when `category` is null. */
export function updateTransactionCategory(id: string, category: string | null): Promise<UpdateCategoryResponse> {
  return apiFetch(`/api/transactions/${id}/category`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category } satisfies UpdateCategoryRequest),
  })
}
