import { http, HttpResponse, type HttpHandler } from 'msw'
import { setupServer } from 'msw/node'
import type {
  Account,
  AccountRequest,
  AccountSource,
  AccountSourceRequest,
  AccountUpdateRequest,
  Category,
  CategoryBudgetRequest,
  CategoryRequest,
  InsightRow,
  MerchantCategoryRequest,
  PatternRow,
  ReorderCategoriesRequest,
  ManualTransaction,
  ManualTransactionRequest,
  Schedule,
  ScheduleRequest,
  SpendingResponse,
  Transaction,
  TransferRule,
  TransferRuleRequest,
  UpdateCategoryRequest,
  UpdatePatternsRequest,
} from '@wealthi/shared'
import {
  ACCOUNT_SOURCES,
  ACCOUNTS,
  BANK_SENDERS,
  CATEGORIES,
  IMPORT_REPORT,
  INSIGHT_ROWS,
  JANUARY,
  JANUARY_BALANCES,
  JANUARY_SPENDING,
  LEARN_REPORT,
  MANUAL_TRANSACTIONS,
  LEARNED,
  PATTERNS,
  SCHEDULES,
  TRANSFER_RULES,
} from './fixtures'

/**
 * A fake backend over in-memory state, so a PATCH really changes what the next
 * GET returns. `requests` records every call for assertions on query strings.
 */
export const api = {
  accounts: [] as Account[],
  accountSources: [] as AccountSource[],
  transferRules: [] as TransferRule[],
  bankSenders: [] as string[],
  transactions: [] as Transaction[],
  spending: null as SpendingResponse | null,
  insights: [] as InsightRow[],
  categories: [] as Category[],
  schedules: [] as Schedule[],
  manualTransactions: [] as ManualTransaction[],
  /** The stored patterns; a learn run adds the `learnable` ones it doesn't hold yet. */
  patterns: [] as PatternRow[],
  learnable: [] as PatternRow[],
  /** Bodies of every PATCH /api/patterns, in order. */
  patternUpdates: [] as UpdatePatternsRequest[],
  requests: [] as URL[],
  reset() {
    this.accounts = structuredClone(ACCOUNTS)
    this.accountSources = structuredClone(ACCOUNT_SOURCES)
    this.transferRules = structuredClone(TRANSFER_RULES)
    this.bankSenders = [...BANK_SENDERS]
    this.transactions = structuredClone(JANUARY)
    this.spending = structuredClone(JANUARY_SPENDING)
    this.insights = structuredClone(INSIGHT_ROWS)
    this.categories = structuredClone(CATEGORIES)
    this.schedules = structuredClone(SCHEDULES)
    this.manualTransactions = structuredClone(MANUAL_TRANSACTIONS)
    this.patterns = structuredClone(PATTERNS)
    this.learnable = structuredClone(LEARNED)
    this.patternUpdates = []
    this.requests = []
  },
  /** Query strings of every request to `path`, in order. */
  queries(path: string): URLSearchParams[] {
    return this.requests.filter((u) => u.pathname === path).map((u) => u.searchParams)
  },
}

const record = (request: Request) => api.requests.push(new URL(request.url))

const categoriesBody = () => ({ categories: api.categories, uncategorized: 'Uncategorized' })
const nextId = () => Math.max(0, ...api.categories.map((c) => c.id)) + 1
const nameTaken = (name: string, exceptId?: number) =>
  api.categories.some((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase())
const conflict = (error: string) => HttpResponse.json({ error }, { status: 409 })

/** What the backend makes of a ScheduleRequest: the account's currency, the category's name. */
function toSchedule(id: number, body: ScheduleRequest, transactionCount = 0): Schedule {
  return {
    ...body,
    id,
    currency: api.accounts.find((a) => a.id === body.account)!.currency,
    category: api.categories.find((c) => c.id === body.categoryId)?.name ?? null,
    nextDate: body.startDate,
    transactionCount,
  }
}

/** What the backend makes of a ManualTransactionRequest: the account's currency, the category's name. */
function toManual(id: number, body: ManualTransactionRequest): ManualTransaction {
  return {
    ...body,
    id,
    currency: api.accounts.find((a) => a.id === body.account)!.currency,
    category: api.categories.find((c) => c.id === body.categoryId)?.name ?? null,
  }
}

export const handlers: HttpHandler[] = [
  http.get('*/api/accounts', ({ request }) => {
    record(request)
    return HttpResponse.json({ accounts: api.accounts })
  }),
  http.post('*/api/accounts', async ({ request }) => {
    record(request)
    const body = (await request.json()) as AccountRequest
    if (api.accounts.some((a) => a.id === body.id)) return conflict(`account "${body.id}" already exists`)
    const account: Account = { ...body }
    api.accounts.push(account)
    return HttpResponse.json({ account }, { status: 201 })
  }),
  http.put('*/api/accounts/:id', async ({ request, params }) => {
    record(request)
    const changes = (await request.json()) as AccountUpdateRequest
    const account = api.accounts.find((a) => a.id === params.id)!
    Object.assign(account, changes)
    return HttpResponse.json({ account })
  }),
  http.delete('*/api/accounts/:id', ({ request, params }) => {
    record(request)
    const id = params.id as string
    const sources = api.accountSources.filter((s) => s.account === id).length
    if (sources > 0)
      return conflict(`"${id}" is used by ${sources} source${sources === 1 ? '' : 's'}; remove them first`)
    api.accounts = api.accounts.filter((a) => a.id !== id)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('*/api/account-sources', ({ request }) => {
    record(request)
    return HttpResponse.json({ accountSources: api.accountSources })
  }),
  http.put('*/api/account-sources', async ({ request }) => {
    record(request)
    const mapping = (await request.json()) as AccountSourceRequest
    if (!api.accounts.some((a) => a.id === mapping.account)) {
      return HttpResponse.json({ error: `account "${mapping.account}" does not exist` }, { status: 400 })
    }
    api.accountSources = [...api.accountSources.filter((s) => s.source !== mapping.source), mapping].sort((a, b) => a.source.localeCompare(b.source)) // prettier-ignore
    return HttpResponse.json({ accountSource: mapping })
  }),
  http.delete('*/api/account-sources/:source', ({ request, params }) => {
    record(request)
    api.accountSources = api.accountSources.filter((s) => s.source !== params.source)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('*/api/transfer-rules', ({ request }) => {
    record(request)
    return HttpResponse.json({ transferRules: api.transferRules })
  }),
  http.post('*/api/transfer-rules', async ({ request }) => {
    record(request)
    const body = (await request.json()) as TransferRuleRequest
    const clash = api.transferRules.some((r) => r.account === body.account && r.type === body.type && r.merchant === body.merchant) // prettier-ignore
    if (clash) return conflict(`a ${body.type} rule for "${body.merchant}" on "${body.account}" already exists`)
    const transferRule: TransferRule = { id: Math.max(0, ...api.transferRules.map((r) => r.id)) + 1, ...body }
    api.transferRules.push(transferRule)
    return HttpResponse.json({ transferRule }, { status: 201 })
  }),
  http.put('*/api/transfer-rules/:id', async ({ request, params }) => {
    record(request)
    const body = (await request.json()) as TransferRuleRequest
    const index = api.transferRules.findIndex((r) => r.id === Number(params.id))
    const transferRule: TransferRule = { id: Number(params.id), ...body }
    api.transferRules[index] = transferRule
    return HttpResponse.json({ transferRule })
  }),
  http.delete('*/api/transfer-rules/:id', ({ request, params }) => {
    record(request)
    api.transferRules = api.transferRules.filter((r) => r.id !== Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('*/api/bank-senders', ({ request }) => {
    record(request)
    return HttpResponse.json({ bankSenders: api.bankSenders })
  }),
  http.post('*/api/bank-senders', async ({ request }) => {
    record(request)
    const { sender } = (await request.json()) as { sender: string }
    if (api.bankSenders.includes(sender)) return conflict(`sender "${sender}" already exists`)
    api.bankSenders = [...api.bankSenders, sender].sort()
    return HttpResponse.json({ bankSenders: api.bankSenders }, { status: 201 })
  }),
  http.delete('*/api/bank-senders/:sender', ({ request, params }) => {
    record(request)
    api.bankSenders = api.bankSenders.filter((s) => s !== params.sender)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('*/api/categories/suggestions', ({ request }) => {
    record(request)
    return HttpResponse.json({ suggestions: [], minRepeats: 5 })
  }),
  http.get('*/api/categories', ({ request }) => {
    record(request)
    return HttpResponse.json(categoriesBody())
  }),
  http.post('*/api/categories', async ({ request }) => {
    record(request)
    const { name } = (await request.json()) as CategoryRequest
    if (nameTaken(name)) return conflict(`category "${name}" already exists`)
    const category: Category = { id: nextId(), name, position: api.categories.length, budget: null, transactionCount: 0, scheduleCount: 0, merchants: [] } // prettier-ignore
    api.categories.push(category)
    return HttpResponse.json({ category }, { status: 201 })
  }),
  // Registered before /:id, as the backend's router is.
  http.put('*/api/categories/order', async ({ request }) => {
    record(request)
    const { ids } = (await request.json()) as ReorderCategoriesRequest
    api.categories = ids.map((id, position) => ({ ...api.categories.find((c) => c.id === id)!, position }))
    return HttpResponse.json(categoriesBody())
  }),
  http.put('*/api/categories/:id/budget', async ({ request, params }) => {
    record(request)
    const { budget } = (await request.json()) as CategoryBudgetRequest
    const category = api.categories.find((c) => c.id === Number(params.id))!
    category.budget = budget
    return HttpResponse.json({ category })
  }),
  http.patch('*/api/categories/:id', async ({ request, params }) => {
    record(request)
    const { name } = (await request.json()) as CategoryRequest
    const category = api.categories.find((c) => c.id === Number(params.id))!
    if (nameTaken(name, category.id)) return conflict(`category "${name}" already exists`)
    category.name = name
    return HttpResponse.json({ category })
  }),
  http.delete('*/api/categories/:id', ({ request, params }) => {
    record(request)
    const category = api.categories.find((c) => c.id === Number(params.id))!
    if (category.transactionCount > 0 || category.scheduleCount > 0 || category.merchants.length > 0)
      return conflict(`"${category.name}" is in use`)
    api.categories = api.categories.filter((c) => c !== category)
    return new HttpResponse(null, { status: 204 })
  }),
  http.put('*/api/merchant-categories', async ({ request }) => {
    record(request)
    const { merchant, categoryId } = (await request.json()) as MerchantCategoryRequest
    for (const c of api.categories) {
      c.merchants = c.merchants.filter((m) => m !== merchant)
      if (c.id === categoryId) c.merchants = [...c.merchants, merchant].sort()
    }
    return HttpResponse.json(categoriesBody())
  }),
  http.get('*/api/schedules/suggestions', ({ request }) => {
    record(request)
    return HttpResponse.json({ suggestions: [], minMonths: 3 })
  }),
  http.get('*/api/schedules', ({ request }) => {
    record(request)
    return HttpResponse.json({ schedules: api.schedules })
  }),
  http.post('*/api/schedules', async ({ request }) => {
    record(request)
    const body = (await request.json()) as ScheduleRequest
    const schedule = toSchedule(Math.max(0, ...api.schedules.map((s) => s.id)) + 1, body)
    api.schedules.push(schedule)
    return HttpResponse.json({ schedule }, { status: 201 })
  }),
  http.put('*/api/schedules/:id', async ({ request, params }) => {
    record(request)
    const body = (await request.json()) as ScheduleRequest
    const index = api.schedules.findIndex((s) => s.id === Number(params.id))
    const schedule = toSchedule(Number(params.id), body, api.schedules[index].transactionCount)
    api.schedules[index] = schedule
    return HttpResponse.json({ schedule })
  }),
  http.delete('*/api/schedules/:id', ({ request, params }) => {
    record(request)
    api.schedules = api.schedules.filter((s) => s.id !== Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('*/api/manual-transactions', ({ request }) => {
    record(request)
    const yearMonth = new URL(request.url).searchParams.get('yearMonth')
    return HttpResponse.json({
      manualTransactions: api.manualTransactions.filter((m) => !yearMonth || m.date.startsWith(yearMonth)),
    })
  }),
  http.post('*/api/manual-transactions', async ({ request }) => {
    record(request)
    const body = (await request.json()) as ManualTransactionRequest
    const manualTransaction = toManual(Math.max(0, ...api.manualTransactions.map((m) => m.id)) + 1, body)
    api.manualTransactions.unshift(manualTransaction)
    return HttpResponse.json({ manualTransaction }, { status: 201 })
  }),
  http.put('*/api/manual-transactions/:id', async ({ request, params }) => {
    record(request)
    const body = (await request.json()) as ManualTransactionRequest
    const index = api.manualTransactions.findIndex((m) => m.id === Number(params.id))
    const manualTransaction = toManual(Number(params.id), body)
    api.manualTransactions[index] = manualTransaction
    return HttpResponse.json({ manualTransaction })
  }),
  http.delete('*/api/manual-transactions/:id', ({ request, params }) => {
    record(request)
    api.manualTransactions = api.manualTransactions.filter((m) => m.id !== Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('*/api/transactions', ({ request }) => {
    record(request)
    const q = new URL(request.url).searchParams
    const rows = api.transactions.filter(
      (t) =>
        (!q.get('yearMonth') || t.yearMonth === q.get('yearMonth')) &&
        (!q.get('account') || t.account === q.get('account')) &&
        (!q.get('type') || t.type === q.get('type')) &&
        (!q.get('merchant') || (t.merchant ?? '').toLowerCase().includes(q.get('merchant')!.toLowerCase())) &&
        (q.get('transfer') !== 'only' || t.isTransfer) &&
        (q.get('transfer') !== 'exclude' || !t.isTransfer) &&
        (!q.get('counterAccount') || t.counterAccount === q.get('counterAccount')),
    )
    return HttpResponse.json({ count: rows.length, transactions: rows })
  }),
  http.get('*/api/balances', ({ request }) => {
    record(request)
    const yearMonth = new URL(request.url).searchParams.get('yearMonth')!
    const balances = yearMonth === '2026-01' ? JANUARY_BALANCES : []
    return HttpResponse.json({ yearMonth, count: balances.length, balances })
  }),
  http.get('*/api/spending', ({ request }) => {
    record(request)
    const yearMonth = new URL(request.url).searchParams.get('yearMonth')!
    if (yearMonth === '2026-01' && api.spending) return HttpResponse.json(api.spending)
    return HttpResponse.json({ yearMonth, grandTotal: 0, categories: [], largeTransactions: [], uncategorized: [] })
  }),
  http.get('*/api/insights', ({ request }) => {
    record(request)
    return HttpResponse.json({ rows: api.insights, uncategorized: 'Uncategorized' })
  }),
  http.patch('*/api/transactions/:id/category', async ({ request, params }) => {
    record(request)
    const { categoryId } = (await request.json()) as UpdateCategoryRequest
    const id = params.id as string
    const s = api.spending
    if (s) {
      // What the backend would recompute: the row leaves the uncategorized lists.
      s.uncategorized = s.uncategorized.filter((u) => u.id !== id)
      s.largeTransactions = s.largeTransactions.filter((u) => u.id !== id)
    }
    const row = api.transactions.find((t) => t.id === id) ?? JANUARY[0]
    const category = api.categories.find((c) => c.id === categoryId)?.name ?? null
    return HttpResponse.json({ transaction: { ...row, id, categoryId, category } })
  }),
  http.post('*/api/import', ({ request }) => {
    record(request)
    return HttpResponse.json(IMPORT_REPORT)
  }),
  http.get('*/api/patterns', ({ request }) => {
    record(request)
    return HttpResponse.json({ patterns: api.patterns })
  }),
  http.post('*/api/patterns/learn', ({ request }) => {
    record(request)
    const fresh = api.learnable.filter((l) => !api.patterns.some((p) => p.id === l.id))
    api.patterns = [...api.patterns, ...fresh]
    return HttpResponse.json({ ...LEARN_REPORT, added: fresh.length })
  }),
  http.patch('*/api/patterns', async ({ request }) => {
    record(request)
    const update = (await request.json()) as UpdatePatternsRequest
    api.patternUpdates.push(update)
    const status = (id: string) =>
      update.enable?.includes(id) ? 'enabled' : update.disable?.includes(id) ? 'disabled' : undefined
    api.patterns = api.patterns.map((p) => ({ ...p, status: status(p.id) ?? p.status }))
    return HttpResponse.json({ patterns: api.patterns })
  }),
]

export const server = setupServer(...handlers)
