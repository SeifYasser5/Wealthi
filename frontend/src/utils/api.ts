import type {
  AccountRequest,
  AccountResponse,
  AccountSourceRequest,
  AccountSourceResponse,
  AccountSourcesResponse,
  AccountsResponse,
  AccountUpdateRequest,
  ApiError,
  BankSenderRequest,
  BankSendersResponse,
  BalancesResponse,
  CategoriesResponse,
  CategoryBudgetRequest,
  CategoryRequest,
  CategoryResponse,
  CategorySuggestionsResponse,
  ImportResponse,
  InsightsResponse,
  LearnResponse,
  MerchantCategoryRequest,
  PatternsResponse,
  ManualTransactionRequest,
  ManualTransactionResponse,
  ManualTransactionsResponse,
  ReorderCategoriesRequest,
  ScheduleRequest,
  ScheduleResponse,
  SchedulesResponse,
  ScheduleSuggestionsResponse,
  SpendingResponse,
  TransactionFilters,
  TransactionsResponse,
  TransferRuleRequest,
  TransferRuleResponse,
  TransferRulesResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  UpdatePatternsRequest,
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

  // 204 No Content (a DELETE) has no body to parse.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** A request carrying `body` as JSON. */
function sendJson(method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
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

/** Fetches every non-transfer transaction with its category resolved, for the Insights page to slice. */
export function fetchInsights(signal?: AbortSignal): Promise<InsightsResponse> {
  return apiFetch<InsightsResponse>('/api/insights', { signal })
}

/** Fetches the configured account list. */
export function fetchAccounts(signal?: AbortSignal): Promise<AccountsResponse> {
  return apiFetch<AccountsResponse>('/api/accounts', { signal })
}

/** Fetches every category in order: the Categories page, and every category dropdown. */
export function fetchCategories(signal?: AbortSignal): Promise<CategoriesResponse> {
  return apiFetch<CategoriesResponse>('/api/categories', { signal })
}

/** Fetches the busiest unmapped merchants, offered as new categories. */
export function fetchCategorySuggestions(signal?: AbortSignal): Promise<CategorySuggestionsResponse> {
  return apiFetch<CategorySuggestionsResponse>('/api/categories/suggestions', { signal })
}

/** Adds a category after the others. */
export function createCategory(name: string): Promise<CategoryResponse> {
  return apiFetch('/api/categories', sendJson('POST', { name } satisfies CategoryRequest))
}

/** Renames a category; its transactions and merchants follow. */
export function renameCategory(id: number, name: string): Promise<CategoryResponse> {
  return apiFetch(`/api/categories/${id}`, sendJson('PATCH', { name } satisfies CategoryRequest))
}

/** Deletes a category; the backend refuses one still in use. */
export function deleteCategory(id: number): Promise<void> {
  return apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
}

/** Stores a new order: every category id. Resolves with every category. */
export function reorderCategories(ids: number[]): Promise<CategoriesResponse> {
  return apiFetch('/api/categories/order', sendJson('PUT', { ids } satisfies ReorderCategoriesRequest))
}

/** Sets a category's monthly budget, or clears it with null. */
export function setCategoryBudget(id: number, budget: number | null): Promise<CategoryResponse> {
  return apiFetch(`/api/categories/${id}/budget`, sendJson('PUT', { budget } satisfies CategoryBudgetRequest))
}

/** Maps a merchant to a category, or unmaps it with null. Resolves with every category. */
export function setMerchantCategory(merchant: string, categoryId: number | null): Promise<CategoriesResponse> {
  return apiFetch(
    '/api/merchant-categories',
    sendJson('PUT', { merchant, categoryId } satisfies MerchantCategoryRequest),
  )
}

/** Assigns a category to one transaction, or clears it when `categoryId` is null. */
export function updateTransactionCategory(id: string, categoryId: number | null): Promise<UpdateCategoryResponse> {
  return apiFetch(`/api/transactions/${id}/category`, sendJson('PATCH', { categoryId } satisfies UpdateCategoryRequest))
}

/** Rebuilds the ledger from chat.db; resolves once the import has finished, with its report. */
export function runImport(): Promise<ImportResponse> {
  return apiFetch<ImportResponse>('/api/import', { method: 'POST' })
}

/** Fetches every learned pattern: pending review, enabled and disabled. */
export function fetchPatterns(signal?: AbortSignal): Promise<PatternsResponse> {
  return apiFetch<PatternsResponse>('/api/patterns', { signal })
}

/** Learns patterns from chat.db; resolves once the run has finished, with its report. */
export function learnPatterns(): Promise<LearnResponse> {
  return apiFetch<LearnResponse>('/api/patterns/learn', { method: 'POST' })
}

/** Enables and disables patterns by id; resolves with every pattern. */
export function updatePatterns(update: UpdatePatternsRequest): Promise<PatternsResponse> {
  return apiFetch<PatternsResponse>('/api/patterns', sendJson('PATCH', update))
}

/** Fetches every schedule, by start date. */
export function fetchSchedules(signal?: AbortSignal): Promise<SchedulesResponse> {
  return apiFetch<SchedulesResponse>('/api/schedules', { signal })
}

/** Fetches the merchants charged once a month that no schedule covers yet. */
export function fetchScheduleSuggestions(signal?: AbortSignal): Promise<ScheduleSuggestionsResponse> {
  return apiFetch<ScheduleSuggestionsResponse>('/api/schedules/suggestions', { signal })
}

/** Stores a schedule; its occurrences reach the ledger at the next import. */
export function createSchedule(schedule: ScheduleRequest): Promise<ScheduleResponse> {
  return apiFetch('/api/schedules', sendJson('POST', schedule))
}

/** Replaces a schedule; the next import rewrites every occurrence with it. */
export function updateSchedule(id: number, schedule: ScheduleRequest): Promise<ScheduleResponse> {
  return apiFetch(`/api/schedules/${id}`, sendJson('PUT', schedule))
}

/** Deletes a schedule; its occurrences leave the ledger at the next import. */
export function deleteSchedule(id: number): Promise<void> {
  return apiFetch(`/api/schedules/${id}`, { method: 'DELETE' })
}

/** Fetches the manual transactions dated in `yearMonth` ("YYYY-MM"), newest first. */
export function fetchManualTransactions(yearMonth: string, signal?: AbortSignal): Promise<ManualTransactionsResponse> {
  return apiFetch<ManualTransactionsResponse>(`/api/manual-transactions?${new URLSearchParams({ yearMonth })}`, {
    signal,
  })
}

/** Stores a manual transaction; the next import copies it into the ledger. */
export function createManualTransaction(entry: ManualTransactionRequest): Promise<ManualTransactionResponse> {
  return apiFetch('/api/manual-transactions', sendJson('POST', entry))
}

/** Replaces a manual transaction; the next import rewrites its ledger row. */
export function updateManualTransaction(
  id: number,
  entry: ManualTransactionRequest,
): Promise<ManualTransactionResponse> {
  return apiFetch(`/api/manual-transactions/${id}`, sendJson('PUT', entry))
}

/** Deletes a manual transaction; its ledger row leaves at the next import. */
export function deleteManualTransaction(id: number): Promise<void> {
  return apiFetch(`/api/manual-transactions/${id}`, { method: 'DELETE' })
}

/** Adds an account; its opening balance reaches the balances at the next import. */
export function createAccount(account: AccountRequest): Promise<AccountResponse> {
  return apiFetch('/api/accounts', sendJson('POST', account))
}

/** Renames an account or changes its opening balance; the id and currency stay. */
export function updateAccount(id: string, changes: AccountUpdateRequest): Promise<AccountResponse> {
  return apiFetch(`/api/accounts/${encodeURIComponent(id)}`, sendJson('PUT', changes))
}

/** Deletes an account nothing names; one in use is refused with what uses it. */
export function deleteAccount(id: string): Promise<void> {
  return apiFetch(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Every source key with the account it lands on. */
export function fetchAccountSources(signal?: AbortSignal): Promise<AccountSourcesResponse> {
  return apiFetch<AccountSourcesResponse>('/api/account-sources', { signal })
}

/** Maps a source key to an account, moving it if it was mapped elsewhere. */
export function setAccountSource(mapping: AccountSourceRequest): Promise<AccountSourceResponse> {
  return apiFetch('/api/account-sources', sendJson('PUT', mapping))
}

/** Removes a source key; messages on it become parse errors until it is mapped again. */
export function deleteAccountSource(source: string): Promise<void> {
  return apiFetch(`/api/account-sources/${encodeURIComponent(source)}`, { method: 'DELETE' })
}

/** Every transfer rule, in the order the import tries them. */
export function fetchTransferRules(signal?: AbortSignal): Promise<TransferRulesResponse> {
  return apiFetch<TransferRulesResponse>('/api/transfer-rules', { signal })
}

/** Stores a transfer rule; the next import tags the matching legs. */
export function createTransferRule(rule: TransferRuleRequest): Promise<TransferRuleResponse> {
  return apiFetch('/api/transfer-rules', sendJson('POST', rule))
}

/** Replaces a transfer rule. */
export function updateTransferRule(id: number, rule: TransferRuleRequest): Promise<TransferRuleResponse> {
  return apiFetch(`/api/transfer-rules/${id}`, sendJson('PUT', rule))
}

/** Deletes a transfer rule; its transfers lose their tag at the next import. */
export function deleteTransferRule(id: number): Promise<void> {
  return apiFetch(`/api/transfer-rules/${id}`, { method: 'DELETE' })
}

/** The chat.db handles SMS are imported and learned from. */
export function fetchBankSenders(signal?: AbortSignal): Promise<BankSendersResponse> {
  return apiFetch<BankSendersResponse>('/api/bank-senders', { signal })
}

/** Adds a sender; answers with the full list. */
export function addBankSender(request: BankSenderRequest): Promise<BankSendersResponse> {
  return apiFetch('/api/bank-senders', sendJson('POST', request))
}

/** Removes a sender; its messages are no longer imported or learned from. */
export function deleteBankSender(sender: string): Promise<void> {
  return apiFetch(`/api/bank-senders/${encodeURIComponent(sender)}`, { method: 'DELETE' })
}
