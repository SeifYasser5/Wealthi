import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse, delay } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, server } from '../server'
import { currentUrl, renderApp } from '../render'

const JAN = '/transactions?yearMonth=2026-01'

/** Body rows of the ledger, as arrays of cell text, skipping the header and total rows. */
async function ledgerRows() {
  const table = await screen.findByRole('table')
  const [, , body] = within(table).getAllByRole('rowgroup')
  return within(body)
    .getAllByRole('row')
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    )
}

const selects = () => screen.getAllByRole('combobox') as HTMLSelectElement[]
const [ACCOUNT, TYPE, TRANSFER, COUNTER] = [0, 1, 2, 3]

afterEach(() => vi.useRealTimers())

describe('Transactions page', () => {
  it('lists the month newest first with labels, badges and derived balances', async () => {
    renderApp(JAN)
    expect(await screen.findByText('4 transactions', { selector: 'span' })).toBeInTheDocument()
    expect(await ledgerRows()).toEqual([
      // computed 6000 − 250 = 5750 matches the reported 5750 → discrepancy 0
      ['Jan 20, 2026', 'Checking', 'CARD PAYMENT↔ Credit Card', 'debit', '250', '5,750', '5,750', '0'],
      ['Jan 15, 2026', 'Checking', 'EMPLOYER LTD', 'credit', '5,000', '6,000', '—', '—'],
      ['Jan 10, 2026', 'Credit Card', 'ACME GROCERS', 'debit', '250', '4,750', '—', '—'],
      ['Jan 05, 2026', 'Savings (USD)', '—', 'credit', '20', '—', '—', '—'],
    ])
  })

  it('totals the net per currency', async () => {
    renderApp(JAN)
    const table = await screen.findByRole('table')
    const total = within(within(table).getAllByRole('rowgroup')[1]).getByRole('row')
    expect(within(total).getByText('4 transactions')).toBeInTheDocument()
    expect(within(total).getByText('4,500')).toHaveClass('text-positive') // EGP: 5000 − 250 − 250
    expect(within(total).getByText('20')).toHaveClass('text-positive') // USD
  })

  it('flags a computed balance that disagrees with the bank', async () => {
    api.transactions[0].reportedBalance = 5700
    renderApp(JAN)
    const [first] = await ledgerRows()
    expect(first.slice(5)).toEqual(['5,700', '5,750', '-50'])
    expect(screen.getByText('-50')).toHaveClass('text-warning')
  })

  it('shows the empty state for a month with nothing in it', async () => {
    renderApp('/transactions?yearMonth=2025-06')
    expect(await screen.findByText('No transactions match these filters.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'June 2025' })).toBeInTheDocument()
  })

  it('shows the API error', async () => {
    server.use(http.get('*/api/transactions', () => HttpResponse.json({ error: 'db down' }, { status: 500 })))
    renderApp(JAN)
    expect(await screen.findByText('db down')).toBeInTheDocument()
  })

  it('shows a loading state first', async () => {
    server.use(
      http.get('*/api/transactions', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderApp(JAN)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('defaults to the current month', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 5) })
    renderApp('/transactions')
    expect(screen.getByRole('heading', { name: 'March 2026' })).toBeInTheDocument()
    await waitFor(() => expect(api.queries('/api/transactions').at(-1)?.get('yearMonth')).toBe('2026-03'))
  })

  it('moves between months and keeps the other filters', async () => {
    const { user } = renderApp(`${JAN}&type=debit`)
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('heading', { name: 'December 2025' })).toBeInTheDocument()
    expect(currentUrl().searchParams.get('yearMonth')).toBe('2025-12')
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(currentUrl().searchParams.get('yearMonth')).toBe('2026-02')
    expect(currentUrl().searchParams.get('type')).toBe('debit')
  })

  it('filters by account and direction through the URL and the request', async () => {
    const { user } = renderApp(JAN)
    await screen.findByText('4 transactions', { selector: 'span' })
    await user.selectOptions(selects()[ACCOUNT], 'checking')
    await user.selectOptions(selects()[TYPE], 'credit')
    expect(await screen.findByText('1 transaction', { selector: 'span' })).toBeInTheDocument()
    expect(currentUrl().search).toBe('?yearMonth=2026-01&account=checking&type=credit')
    const last = api.queries('/api/transactions').at(-1)!
    expect([last.get('account'), last.get('type')]).toEqual(['checking', 'credit'])

    await user.selectOptions(selects()[ACCOUNT], '')
    expect(currentUrl().searchParams.has('account')).toBe(false)
  })

  it('picking a counter account switches to transfers only', async () => {
    const { user } = renderApp(JAN)
    await screen.findByText('4 transactions', { selector: 'span' })
    await user.selectOptions(selects()[COUNTER], 'card')
    expect(await screen.findByText('1 transaction', { selector: 'span' })).toBeInTheDocument()
    expect(selects()[TRANSFER]).toHaveValue('only')
    expect(currentUrl().search).toBe('?yearMonth=2026-01&counterAccount=card&transfer=only')

    await user.selectOptions(selects()[COUNTER], '')
    expect(selects()[TRANSFER]).toHaveValue('only') // clearing the counter account leaves the transfer filter
  })

  it('excluding transfers drops and locks the counter account', async () => {
    const { user } = renderApp(`${JAN}&transfer=only&counterAccount=card`)
    await screen.findByText('1 transaction', { selector: 'span' })
    await user.selectOptions(selects()[TRANSFER], 'exclude')
    expect(await screen.findByText('3 transactions', { selector: 'span' })).toBeInTheDocument()
    expect(selects()[COUNTER]).toBeDisabled()
    expect(selects()[COUNTER]).toHaveAttribute('title', 'Not available while transfers are excluded')
    expect(currentUrl().searchParams.has('counterAccount')).toBe(false)
  })

  it('searches merchants after a pause in typing, not per keystroke', async () => {
    const { user } = renderApp(JAN)
    await screen.findByText('4 transactions', { selector: 'span' })
    const before = api.queries('/api/transactions').length
    await user.type(screen.getByPlaceholderText('Search merchant…'), 'acme')
    expect(currentUrl().searchParams.has('merchant')).toBe(false)
    // Debounced by 300 ms; the generous timeout keeps this steady on a loaded machine.
    await waitFor(() => expect(currentUrl().searchParams.get('merchant')).toBe('acme'), { timeout: 3000 })
    expect(await screen.findByText('1 transaction', { selector: 'span' })).toBeInTheDocument()
    const merchantQueries = api
      .queries('/api/transactions')
      .slice(before)
      .map((q) => q.get('merchant'))
    expect(merchantQueries).toEqual(['acme'])

    await user.clear(screen.getByPlaceholderText('Search merchant…'))
    await waitFor(() => expect(currentUrl().searchParams.has('merchant')).toBe(false), { timeout: 3000 })
  })

  it('ignores filter values it does not recognise', async () => {
    renderApp(`${JAN}&type=transfer&transfer=maybe&yearMonth=bogus&account=nope&counterAccount=nope`)
    await screen.findByText(/transactions?$/, { selector: 'span' })
    await waitFor(() => {
      const q = api.queries('/api/transactions').at(-1)!
      expect([...q.keys()]).toEqual(['yearMonth'])
    })
    expect(selects()[TYPE]).toHaveValue('')
    expect(selects()[TRANSFER]).toHaveValue('')
  })

  it('reads a hand-edited counterAccount + transfer=exclude URL as the exclusion', async () => {
    renderApp(`${JAN}&transfer=exclude&counterAccount=card`)
    expect(await screen.findByText('3 transactions', { selector: 'span' })).toBeInTheDocument()
    expect(api.queries('/api/transactions').at(-1)!.has('counterAccount')).toBe(false)
  })

  it('trusts account ids in the URL until the account list loads', async () => {
    server.use(
      http.get('*/api/accounts', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderApp(`${JAN}&account=card`)
    await waitFor(() => expect(api.queries('/api/transactions').at(-1)?.get('account')).toBe('card'))
    // Without labels yet, rows show the raw account id.
    expect(await screen.findByText('card')).toBeInTheDocument()
  })

  it('shows "Updating…" while a refetch runs over data already on screen', async () => {
    const { user } = renderApp(JAN)
    await screen.findByText('4 transactions', { selector: 'span' })
    server.use(
      http.get('*/api/transactions', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await user.selectOptions(selects()[TYPE], 'debit')
    expect(await screen.findByText('Updating…')).toBeInTheDocument()
    expect(screen.getByText('4 transactions', { selector: 'span' })).toBeInTheDocument() // previous rows stay visible
  })

  it('filters to transfers only without touching the counter account', async () => {
    const { user } = renderApp(JAN)
    await screen.findByText('4 transactions', { selector: 'span' })
    await user.selectOptions(selects()[TRANSFER], 'only')
    expect(await screen.findByText('1 transaction', { selector: 'span' })).toBeInTheDocument()
    expect(currentUrl().search).toBe('?yearMonth=2026-01&transfer=only')
    expect(selects()[COUNTER]).toBeEnabled()
  })
})
