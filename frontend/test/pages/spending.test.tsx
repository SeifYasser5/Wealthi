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

/** Drags one budget row's handle onto another row. jsdom has no DataTransfer, so a stub carries the calls. */
function drag(from: string, to: string) {
  const dataTransfer = { effectAllowed: '', setDragImage: () => {} }
  const target = screen.getByRole('listitem', { name: to })
  fireEvent.dragStart(screen.getByRole('button', { name: `Drag ${from} to reorder` }), { dataTransfer })
  fireEvent.dragOver(target, { dataTransfer })
  fireEvent.drop(target, { dataTransfer })
}

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
    expect(groceries).toHaveAttribute('aria-expanded', 'true')
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

    let sent: unknown
    server.use(
      http.patch('*/api/transactions/:id/category', async ({ request }) => {
        sent = await request.clone().json()
        return undefined
      }),
    )
    await user.selectOptions(select, 'Dining')
    const patch = api.requests.find((u) => u.pathname === `/api/transactions/${UNCATEGORIZED_ID}/category`)
    expect(patch).toBeDefined()
    // The id, not the name: the backend's foreign key decides whether it exists.
    expect(sent).toEqual({ categoryId: 1 })
    expect(await screen.findByText('Nothing left to categorize in this bucket.')).toBeInTheDocument()
    expect(screen.getByText('0 transactions to categorize')).toBeInTheDocument()
  })

  it('offers the categories in their stored order', async () => {
    api.categories.reverse()
    const { user } = renderApp(JAN)
    await user.click((await screen.findByText('Uncategorized')).closest('button')!)
    const select = within(screen.getByText('MYSTERY').closest('tr')!).getByRole('combobox')
    await waitFor(() => expect(select).toBeEnabled())
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Categorize…', 'Rent', 'Groceries', 'Dining'])
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
        return HttpResponse.json({ error: 'category 3 does not exist' }, { status: 400 })
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
    expect(await within(card).findByText('category 3 does not exist')).toBeInTheDocument()
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

  describe('Budget view', () => {
    const budgets = () => screen.findByRole('list', { name: 'Budgets' })

    it('toggles with the same button and keeps the spending order', async () => {
      const { user } = renderApp(JAN)
      await screen.findByText('3 categories')
      const before = cardLabels()
      expect(before).toEqual(['Groceries', 'BIG PURCHASE', 'Dining', 'Uncategorized'])

      await user.click(screen.getByRole('tab', { name: 'Budget' }))
      await budgets()
      expect(screen.getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true')

      await user.click(screen.getByRole('tab', { name: 'Spending' }))
      await screen.findByText('3 categories')
      expect(cardLabels()).toEqual(before)
    })

    it('lists every category in stored order with spend against its allowance and the total', async () => {
      const { user } = renderApp(JAN)
      await user.click(await screen.findByRole('tab', { name: 'Budget' }))
      const list = await budgets()

      expect(
        within(list)
          .getAllByRole('listitem')
          .map((li) => li.getAttribute('aria-label')),
      ).toEqual(['Dining', 'Groceries', 'Rent'])
      const groceries = within(list).getByRole('listitem', { name: 'Groceries' })
      expect(within(groceries).getByRole('button', { name: 'Edit budget for Groceries' })).toHaveTextContent('1,000')
      expect(groceries).toHaveTextContent('400 left')
      expect(within(list).getByRole('button', { name: 'Set budget for Rent' })).toBeInTheDocument()
      expect(screen.getByText('1 budget set', { exact: false })).toBeInTheDocument()
    })

    it('saves a budget on blur, clears it when emptied and ignores junk', async () => {
      const { user } = renderApp(JAN)
      await user.click(await screen.findByRole('tab', { name: 'Budget' }))
      await budgets()

      const edit = async () => {
        await user.click(screen.getByRole('button', { name: /^(Set|Edit) budget for Dining$/ }))
        return screen.getByRole('textbox', { name: 'Budget for Dining' })
      }

      await edit()
      await user.tab()
      expect(api.requests.filter((u) => u.pathname.endsWith('/budget'))).toHaveLength(0)

      await user.type(await edit(), '250{Enter}')
      await waitFor(() => expect(api.categories[0].budget).toBe(250))
      expect(await screen.findByRole('button', { name: 'Edit budget for Dining' })).toHaveTextContent('250')

      const abc = await edit()
      await user.clear(abc)
      await user.type(abc, 'abc')
      await user.tab()
      expect(screen.getByRole('button', { name: 'Edit budget for Dining' })).toHaveTextContent('250')

      const neg = await edit()
      await user.clear(neg)
      await user.type(neg, '-5')
      await user.tab()
      expect(screen.getByRole('button', { name: 'Edit budget for Dining' })).toHaveTextContent('250')

      await user.type(await edit(), '999{Escape}')
      expect(screen.getByRole('button', { name: 'Edit budget for Dining' })).toHaveTextContent('250')

      await user.clear(await edit())
      await user.tab()
      await waitFor(() => expect(api.categories[0].budget).toBeNull())
    })

    it('is still available in a month with no spending', async () => {
      const { user } = renderApp('/spending?yearMonth=2026-02')
      expect(await screen.findByText('No spending data for this month.')).toBeInTheDocument()
      await user.click(screen.getByRole('tab', { name: 'Budget' }))
      expect(await budgets()).toBeInTheDocument()
    })

    it('reorders categories', async () => {
      const { user } = renderApp(JAN)
      await user.click(await screen.findByRole('tab', { name: 'Budget' }))
      await budgets()

      drag('Dining', 'Groceries')
      await waitFor(() =>
        expect(within(screen.getByRole('list', { name: 'Budgets' })).getAllByRole('listitem')[0]).toHaveAccessibleName(
          'Groceries',
        ),
      )
    })

    it('drags a category up, and ignores a drop on itself or with nothing dragged', async () => {
      const { user } = renderApp(JAN)
      await user.click(await screen.findByRole('tab', { name: 'Budget' }))
      await budgets()
      const names = () =>
        within(screen.getByRole('list', { name: 'Budgets' }))
          .getAllByRole('listitem')
          .map((li) => li.getAttribute('aria-label'))
      const before = names()

      drag('Dining', 'Dining')
      // A drag dropped outside any row just ends.
      const handle = screen.getByRole('button', { name: 'Drag Dining to reorder' })
      fireEvent.dragStart(handle, { dataTransfer: { setDragImage: () => {} } })
      fireEvent.dragEnd(handle)
      expect(names()).toEqual(before)
      fireEvent.drop(screen.getByRole('listitem', { name: 'Rent' }))
      expect(names()).toEqual(before)

      drag('Rent', 'Dining')
      await waitFor(() => expect(names()[0]).toBe('Rent'))
    })

    it('shows a failed reorder, and puts a refused budget back', async () => {
      server.use(
        http.put('*/api/categories/order', () => HttpResponse.json({ error: 'stale order' }, { status: 409 })),
        http.put('*/api/categories/:id/budget', () => HttpResponse.json({ error: 'nope' }, { status: 500 })),
      )
      const { user } = renderApp(JAN)
      await user.click(await screen.findByRole('tab', { name: 'Budget' }))
      await budgets()

      drag('Dining', 'Groceries')
      expect(await screen.findByRole('alert')).toHaveTextContent('stale order')

      await user.click(screen.getByRole('button', { name: 'Set budget for Dining' }))
      await user.type(screen.getByRole('textbox', { name: 'Budget for Dining' }), '5{Enter}')
      expect(await screen.findByRole('button', { name: 'Set budget for Dining' })).toBeInTheDocument()
    })

    it('fills the bar with a zero budget once anything is spent, and marks an overspent one', async () => {
      api.categories[0].budget = 0 // Dining spent 100
      api.categories[1].budget = 100 // Groceries spent 600
      api.categories[2].budget = 0 // Rent spent nothing
      const { user } = renderApp(JAN)
      await user.click(await screen.findByRole('tab', { name: 'Budget' }))
      await budgets()
      const bar = (name: string) => within(screen.getByRole('listitem', { name })).getByRole('progressbar')
      expect(bar('Dining')).toHaveAttribute('aria-valuenow', '100')
      expect(bar('Groceries')).toHaveAttribute('aria-valuenow', '100')
      expect(screen.getByRole('listitem', { name: 'Groceries' })).toHaveTextContent('500 over')
      expect(bar('Rent')).toHaveAttribute('aria-valuenow', '0')
    })
  })
})
