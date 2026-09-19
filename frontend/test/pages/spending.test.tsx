import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse, delay } from 'msw'
import { describe, expect, it } from 'vitest'
import { api, server } from '../server'
import { currentUrl, renderApp } from '../render'
import { LARGE_ID, UNCATEGORIZED_ID } from '../fixtures'

const JAN = '/spending?yearMonth=2026-01'

/** The card headings in display order. */
const cardLabels = () =>
  screen
    .getAllByText(
      (_, el) => el?.tagName === 'SPAN' && el.classList.contains('font-semibold') && !!el.closest('.rounded-2xl'),
    )
    .map((el) => el.textContent)

describe('Spending page', () => {
  it('summarises the month and interleaves categories with large transactions by size', async () => {
    renderApp(JAN)
    expect(await screen.findByText('3 categories')).toBeInTheDocument()
    expect(screen.getByText('· 1 large')).toBeInTheDocument()
    expect(screen.getByText('Total').parentElement).toHaveTextContent('Total 1,000')
    expect(cardLabels()).toEqual(['Groceries', 'BIG PURCHASE', 'Dining', 'Uncategorized'])
    expect(screen.getByText('60.0%')).toBeInTheDocument()
    expect(screen.getByText('2 merchants')).toBeInTheDocument()
    expect(screen.getByText('1 transaction to categorize')).toBeInTheDocument()
    expect(screen.getByText('28.0% of total · single transaction')).toBeInTheDocument()
  })

  it('expands a category into its merchants and collapses it again', async () => {
    const { user } = renderApp(JAN)
    const groceries = (await screen.findByText('Groceries')).closest('button')!
    expect(screen.queryByText('CORNER SHOP')).not.toBeInTheDocument()
    await user.click(groceries)
    const merchants = screen.getByText('CORNER SHOP').closest('table')!
    expect(
      within(merchants)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['ACME GROCERS450', 'CORNER SHOP150'])
    expect(groceries).toHaveTextContent('▲')
    await user.click(groceries)
    expect(screen.queryByText('CORNER SHOP')).not.toBeInTheDocument()
  })

  it('categorizes an uncategorized transaction and refreshes the breakdown', async () => {
    const { user } = renderApp(JAN)
    await user.click((await screen.findByText('Uncategorized')).closest('button')!)
    const row = screen.getByText('MYSTERY').closest('tr')!
    expect(row).toHaveTextContent('Jan 12 · card')
    const select = within(row).getByRole('combobox')
    await waitFor(() => expect(select).toBeEnabled()) // categories loaded
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Categorize…', 'Dining', 'Groceries', 'Rent'])

    await user.selectOptions(select, 'Dining')
    const patch = api.requests.find((u) => u.pathname === `/api/transactions/${UNCATEGORIZED_ID}/category`)
    expect(patch).toBeDefined()
    expect(await screen.findByText('Nothing left to categorize in this bucket.')).toBeInTheDocument()
    expect(screen.getByText('0 transactions to categorize')).toBeInTheDocument()
  })

  it('categorizes a large transaction from its own card', async () => {
    const { user } = renderApp(JAN)
    const card = (await screen.findByText('BIG PURCHASE')).closest('.rounded-2xl') as HTMLElement
    const select = within(card).getByRole('combobox')
    await waitFor(() => expect(select).toBeEnabled())
    await user.selectOptions(select, 'Rent')
    await waitFor(() => expect(screen.queryByText('BIG PURCHASE')).not.toBeInTheDocument())
    expect(api.requests.some((u) => u.pathname === `/api/transactions/${LARGE_ID}/category`)).toBe(true)
  })

  it('shows "Saving…" while the change is in flight, then the error on the row that failed', async () => {
    // The server holds its answer until the test has seen the in-flight state — no timing involved.
    let respond!: () => void
    const answered = new Promise<void>((resolve) => (respond = resolve))
    server.use(
      http.patch('*/api/transactions/:id/category', async () => {
        await answered
        return HttpResponse.json({ error: 'category must be null or one of: Dining' }, { status: 400 })
      }),
    )
    const { user } = renderApp(JAN)
    const card = (await screen.findByText('BIG PURCHASE')).closest('.rounded-2xl') as HTMLElement
    const select = within(card).getByRole('combobox')
    await waitFor(() => expect(select).toBeEnabled())
    await user.selectOptions(select, 'Rent')
    expect(await within(card).findByText('Saving…')).toBeInTheDocument()
    expect(select).toBeDisabled()

    respond()
    expect(await within(card).findByText('category must be null or one of: Dining')).toBeInTheDocument()
    expect(select).toHaveClass('border-negative')
    expect(screen.getByText('BIG PURCHASE')).toBeInTheDocument()
  })

  it('keeps the category picker disabled until categories load', async () => {
    server.use(
      http.get('*/api/categories', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderApp(JAN)
    const card = (await screen.findByText('BIG PURCHASE')).closest('.rounded-2xl') as HTMLElement
    expect(within(card).getByRole('combobox')).toBeDisabled()
  })

  it('shows a merchant-less uncategorized row clearly', async () => {
    api.spending!.uncategorized[0].merchant = null
    const { user } = renderApp(JAN)
    await user.click((await screen.findByText('Uncategorized')).closest('button')!)
    expect(screen.getByText('no merchant')).toBeInTheDocument()
  })

  it('labels a large transaction without a merchant by its account', async () => {
    api.spending!.largeTransactions[0].merchant = null
    renderApp(JAN)
    expect(await screen.findByText('card')).toBeInTheDocument()
  })

  it('shows the empty state for a month with no spending', async () => {
    renderApp('/spending?yearMonth=2025-01')
    expect(await screen.findByText('No spending data for this month.')).toBeInTheDocument()
  })

  it('shows the API error', async () => {
    server.use(http.get('*/api/spending', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
    renderApp(JAN)
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })

  it('omits the large count when there are none', async () => {
    api.spending!.largeTransactions = []
    renderApp(JAN)
    await screen.findByText('3 categories')
    expect(screen.queryByText(/large$/)).not.toBeInTheDocument()
  })

  it('moves between months', async () => {
    const { user } = renderApp(JAN)
    await screen.findByText('3 categories')
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('No spending data for this month.')).toBeInTheDocument()
    expect(currentUrl().searchParams.get('yearMonth')).toBe('2025-12')
  })

  it('ignores picking the placeholder option', async () => {
    const { user } = renderApp(JAN)
    const card = (await screen.findByText('BIG PURCHASE')).closest('.rounded-2xl') as HTMLElement
    const select = within(card).getByRole('combobox')
    await waitFor(() => expect(select).toBeEnabled())
    fireEvent.change(select, { target: { value: '' } })
    await user.click(document.body)
    expect(api.requests.some((u) => u.pathname.endsWith('/category'))).toBe(false)
  })
})
