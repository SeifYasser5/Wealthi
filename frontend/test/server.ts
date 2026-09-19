import { http, HttpResponse, type HttpHandler } from 'msw'
import { setupServer } from 'msw/node'
import type { SpendingResponse, Transaction, UpdateCategoryRequest } from '@wealthi/shared'
import { ACCOUNTS, CATEGORIES, JANUARY, JANUARY_BALANCES, JANUARY_SPENDING } from './fixtures'

/**
 * A fake backend over in-memory state, so a PATCH really changes what the next
 * GET returns. `requests` records every call for assertions on query strings.
 */
export const api = {
  transactions: [] as Transaction[],
  spending: null as SpendingResponse | null,
  requests: [] as URL[],
  reset() {
    this.transactions = structuredClone(JANUARY)
    this.spending = structuredClone(JANUARY_SPENDING)
    this.requests = []
  },
  /** Query strings of every request to `path`, in order. */
  queries(path: string): URLSearchParams[] {
    return this.requests.filter((u) => u.pathname === path).map((u) => u.searchParams)
  },
}

const record = (request: Request) => api.requests.push(new URL(request.url))

export const handlers: HttpHandler[] = [
  http.get('*/api/accounts', ({ request }) => {
    record(request)
    return HttpResponse.json({ accounts: ACCOUNTS })
  }),
  http.get('*/api/categories', ({ request }) => {
    record(request)
    return HttpResponse.json({ categories: CATEGORIES, uncategorized: 'Uncategorized' })
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
  http.patch('*/api/transactions/:id/category', async ({ request, params }) => {
    record(request)
    const { category } = (await request.json()) as UpdateCategoryRequest
    const id = params.id as string
    const s = api.spending
    if (s) {
      // What the backend would recompute: the row leaves the uncategorized lists.
      s.uncategorized = s.uncategorized.filter((u) => u.id !== id)
      s.largeTransactions = s.largeTransactions.filter((u) => u.id !== id)
    }
    const row = api.transactions.find((t) => t.id === id) ?? JANUARY[0]
    return HttpResponse.json({ transaction: { ...row, id, category } })
  }),
]

export const server = setupServer(...handlers)
