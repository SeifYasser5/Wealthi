import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  fetchAccounts,
  fetchBalances,
  fetchCategories,
  fetchSpending,
  fetchTransactions,
  updateTransactionCategory,
} from '../../src/utils/api'
import { api, server } from '../server'

const lastRequest = () => api.requests.at(-1)!

describe('fetchTransactions', () => {
  it('sends only the filters that are set', async () => {
    await fetchTransactions({ yearMonth: '2026-01', account: '', merchant: 'acme', type: undefined })
    expect(lastRequest().pathname).toBe('/api/transactions')
    expect(lastRequest().search).toBe('?yearMonth=2026-01&merchant=acme')
  })

  it('omits the query string entirely when no filter is set', async () => {
    await fetchTransactions({})
    expect(lastRequest().search).toBe('')
  })

  it('sends a counter account, but never alongside transfer=exclude', async () => {
    await fetchTransactions({ transfer: 'only', counterAccount: 'card' })
    expect(lastRequest().search).toBe('?transfer=only&counterAccount=card')
    await fetchTransactions({ transfer: 'exclude', counterAccount: 'card' })
    expect(lastRequest().search).toBe('?transfer=exclude')
  })

  it('returns the parsed body', async () => {
    const res = await fetchTransactions({ yearMonth: '2026-01', account: 'card' })
    expect(res.count).toBe(1)
    expect(res.transactions[0].merchant).toBe('ACME GROCERS')
  })
})

describe('other fetchers', () => {
  it('hit the right endpoints', async () => {
    expect((await fetchBalances('2026-01')).count).toBe(3)
    expect(lastRequest().search).toBe('?yearMonth=2026-01')
    expect((await fetchSpending('2026-01')).grandTotal).toBe(1000)
    expect(lastRequest().pathname).toBe('/api/spending')
    expect((await fetchAccounts()).accounts).toHaveLength(3)
    expect((await fetchCategories()).uncategorized).toBe('Uncategorized')
  })

  it('PATCHes a category as JSON, and null to clear', async () => {
    let body: unknown
    let contentType: string | null = null
    server.use(
      http.patch('*/api/transactions/:id/category', async ({ request, params }) => {
        body = await request.json()
        contentType = request.headers.get('Content-Type')
        return HttpResponse.json({ transaction: { id: params.id } })
      }),
    )
    const res = await updateTransactionCategory('abc', 'Rent')
    expect(res.transaction.id).toBe('abc')
    expect(body).toEqual({ category: 'Rent' })
    expect(contentType).toBe('application/json')
    await updateTransactionCategory('abc', null)
    expect(body).toEqual({ category: null })
  })
})

describe('errors', () => {
  it('throws the API’s own error message', async () => {
    server.use(http.get('*/api/balances', () => HttpResponse.json({ error: 'yearMonth is bad' }, { status: 400 })))
    await expect(fetchBalances('x')).rejects.toThrow('yearMonth is bad')
  })

  it('falls back to the status when the body has no message or is not JSON', async () => {
    server.use(http.get('*/api/accounts', () => HttpResponse.json({}, { status: 500 })))
    await expect(fetchAccounts()).rejects.toThrow('Request failed with status 500')
    server.use(http.get('*/api/accounts', () => new HttpResponse('Bad Gateway', { status: 502 })))
    await expect(fetchAccounts()).rejects.toThrow('Request failed with status 502')
  })

  it('passes the abort signal through', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(fetchCategories(controller.signal)).rejects.toThrow()
  })
})
