import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../render'
import { api, server } from '../server'

const list = () => screen.findByRole('region', { name: 'Your categories' })
const row = (name: string) => screen.getByRole('listitem', { name })
const rowNames = () =>
  within(screen.getByRole('region', { name: 'Your categories' }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)
/** Requests to a /api/categories/:id path: only a rename or a delete sends one. */
const requestsTo = (path: string) => api.requests.filter((u) => u.pathname === path).length

/** Captures the JSON body of every `method path` request, then lets the default handler answer. */
function bodiesOf(method: 'post' | 'patch' | 'put', path: string) {
  const bodies: unknown[] = []
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.clone().json())
      return undefined
    }),
  )
  return bodies
}

describe('Categories page', () => {
  it('is in the nav bar and lists the categories in order, with what uses each', async () => {
    const { user } = renderApp('/transactions')
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Categories' }))
    expect(await screen.findByRole('heading', { name: 'Categories', level: 1 })).toBeInTheDocument()

    await list()
    expect(rowNames()).toEqual(['Dining', 'Groceries', 'Rent'])
    expect(row('Groceries')).toHaveTextContent('Used by 2 transactions, 1 schedule and 2 merchants')
    expect(row('Dining')).toHaveTextContent('Used by 1 merchant')
    expect(row('Rent')).toHaveTextContent('Not used yet')
    expect(within(row('Groceries')).getByText('ACME GROCERS')).toBeInTheDocument()
  })

  it('says so when there are none', async () => {
    api.categories = []
    renderApp('/categories')
    expect(await screen.findByText('No categories yet. Add your first one above.')).toBeInTheDocument()
  })

  it('shows why the list could not load', async () => {
    server.use(http.get('*/api/categories', () => HttpResponse.json({ error: 'database down' }, { status: 500 })))
    renderApp('/categories')
    expect(await screen.findByText('database down')).toBeInTheDocument()
  })

  it('adds a category, trimmed, at the end', async () => {
    const bodies = bodiesOf('post', '*/api/categories')
    const { user } = renderApp('/categories')
    await list()
    const field = screen.getByRole('textbox', { name: 'New category' })
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()

    await user.type(field, '  Travel ')
    await user.click(add)
    await waitFor(() => expect(rowNames()).toEqual(['Dining', 'Groceries', 'Rent', 'Travel']))
    expect(bodies).toEqual([{ name: 'Travel' }])
    expect(field).toHaveValue('')
  })

  it('shows the backend’s reason when a name is taken, keeping what was typed', async () => {
    const { user } = renderApp('/categories')
    await list()
    await user.type(screen.getByRole('textbox', { name: 'New category' }), 'dining{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('category "dining" already exists')
    expect(screen.getByRole('textbox', { name: 'New category' })).toHaveValue('dining')
  })

  it('renames a category in place', async () => {
    const bodies = bodiesOf('patch', '*/api/categories/:id')
    const { user } = renderApp('/categories')
    await list()
    await user.click(screen.getByRole('button', { name: 'Rename Rent' }))
    const field = screen.getByRole('textbox', { name: 'New name for Rent' })
    expect(field).toHaveFocus()
    await user.clear(field)
    await user.type(field, 'Housing{Enter}')

    expect(await screen.findByRole('heading', { name: 'Housing', level: 3 })).toBeInTheDocument()
    expect(bodies).toEqual([{ name: 'Housing' }])
    expect(screen.queryByRole('textbox', { name: /New name/ })).not.toBeInTheDocument()
  })

  it('closes the rename without a request when the name is unchanged, or on cancel', async () => {
    const { user } = renderApp('/categories')
    await list()
    await user.click(screen.getByRole('button', { name: 'Rename Rent' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('textbox', { name: 'New name for Rent' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rename Rent' }))
    await user.clear(screen.getByRole('textbox', { name: 'New name for Rent' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancel rename' }))
    expect(rowNames()).toEqual(['Dining', 'Groceries', 'Rent'])
    expect(requestsTo('/api/categories/3')).toBe(0)
  })

  it('shows a rename the backend refused under the field', async () => {
    const { user } = renderApp('/categories')
    await list()
    await user.click(screen.getByRole('button', { name: 'Rename Rent' }))
    const field = screen.getByRole('textbox', { name: 'New name for Rent' })
    await user.clear(field)
    await user.type(field, 'Groceries{Enter}')
    expect(await within(row('Rent')).findByRole('alert')).toHaveTextContent('category "Groceries" already exists')
    expect(field).toBeInTheDocument()
  })

  it('moves a category up and down, sending the whole order', async () => {
    const bodies = bodiesOf('put', '*/api/categories/order')
    const { user } = renderApp('/categories')
    await list()
    expect(screen.getByRole('button', { name: 'Move Dining up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Rent down' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Move Rent up' }))
    await waitFor(() => expect(rowNames()).toEqual(['Dining', 'Rent', 'Groceries']))
    await user.click(screen.getByRole('button', { name: 'Move Dining down' }))
    await waitFor(() => expect(rowNames()).toEqual(['Rent', 'Dining', 'Groceries']))
    expect(bodies).toEqual([{ ids: [1, 3, 2] }, { ids: [3, 1, 2] }])
  })

  it('shows a refused reorder', async () => {
    server.use(
      http.put('*/api/categories/order', () =>
        HttpResponse.json(
          { error: 'ids must list every category exactly once; reload and try again' },
          { status: 409 },
        ),
      ),
    )
    const { user } = renderApp('/categories')
    await list()
    await user.click(screen.getByRole('button', { name: 'Move Rent up' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('reload and try again')
    expect(rowNames()).toEqual(['Dining', 'Groceries', 'Rent'])
  })

  it('deletes only a category nothing uses', async () => {
    const { user } = renderApp('/categories')
    await list()
    for (const name of ['Dining', 'Groceries']) {
      const button = screen.getByRole('button', { name: `Delete ${name}` })
      expect(button).toBeDisabled()
      expect(button.title).toMatch(/: move them to another category first$/)
    }
    expect(row('Groceries')).toHaveTextContent('move them to another category to delete it')

    await user.click(screen.getByRole('button', { name: 'Delete Rent' }))
    await waitFor(() => expect(rowNames()).toEqual(['Dining', 'Groceries']))
    expect(requestsTo('/api/categories/3')).toBe(1)
  })

  it('shows a refused delete', async () => {
    server.use(
      http.delete('*/api/categories/:id', () => HttpResponse.json({ error: '"Rent" is in use' }, { status: 409 })),
    )
    const { user } = renderApp('/categories')
    await list()
    await user.click(screen.getByRole('button', { name: 'Delete Rent' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('"Rent" is in use')
  })

  it('maps a merchant, moving it from the category that held it', async () => {
    const bodies = bodiesOf('put', '*/api/merchant-categories')
    const { user } = renderApp('/categories')
    await list()
    await user.click(within(row('Rent')).getByRole('button', { name: 'Merchant' }))
    expect(within(row('Rent')).getByRole('button', { name: 'Map' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Merchant to map to Rent' }), 'CITY CAFE')
    await user.click(within(row('Rent')).getByRole('button', { name: 'Map' }))

    expect(await within(row('Rent')).findByText('CITY CAFE')).toBeInTheDocument()
    expect(bodies).toEqual([{ merchant: 'CITY CAFE', categoryId: 3 }])
    expect(row('Dining')).toHaveTextContent('Not used yet')
    expect(screen.queryByRole('textbox', { name: 'Merchant to map to Rent' })).not.toBeInTheDocument()
  })

  it('sends the merchant exactly as typed: the bank’s string, spaces and all', async () => {
    const bodies = bodiesOf('put', '*/api/merchant-categories')
    const { user } = renderApp('/categories')
    await list()
    await user.click(within(row('Rent')).getByRole('button', { name: 'Merchant' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant to map to Rent' }), ' Corner Shop {Enter}')
    await waitFor(() => expect(bodies).toEqual([{ merchant: ' Corner Shop ', categoryId: 3 }]))
  })

  it('unmaps a merchant, which frees its category to be deleted', async () => {
    const bodies = bodiesOf('put', '*/api/merchant-categories')
    const { user } = renderApp('/categories')
    await list()
    await user.click(screen.getByRole('button', { name: 'Remove CITY CAFE from Dining' }))
    await waitFor(() => expect(row('Dining')).toHaveTextContent('Not used yet'))
    expect(bodies).toEqual([{ merchant: 'CITY CAFE', categoryId: null }])
    expect(screen.getByRole('button', { name: 'Delete Dining' })).toBeEnabled()
  })

  it('cancels a mapping, and shows a refused one', async () => {
    const { user } = renderApp('/categories')
    await list()
    await user.click(within(row('Rent')).getByRole('button', { name: 'Merchant' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant to map to Rent' }), 'X')
    await user.click(screen.getByRole('button', { name: 'Cancel mapping' }))
    expect(screen.queryByRole('textbox', { name: 'Merchant to map to Rent' })).not.toBeInTheDocument()

    server.use(
      http.put('*/api/merchant-categories', () =>
        HttpResponse.json({ error: 'category 3 does not exist' }, { status: 400 }),
      ),
    )
    await user.click(within(row('Rent')).getByRole('button', { name: 'Merchant' }))
    expect(screen.getByRole('textbox', { name: 'Merchant to map to Rent' })).toHaveValue('')
    await user.type(screen.getByRole('textbox', { name: 'Merchant to map to Rent' }), 'CAFE{Enter}')
    expect(await within(row('Rent')).findByRole('alert')).toHaveTextContent('category 3 does not exist')
  })

  it('suggests the merchants that keep repeating, with their repeated amounts and the rest as Others', async () => {
    server.use(
      http.get('*/api/categories/suggestions', () =>
        HttpResponse.json({
          suggestions: [
            {
              merchant: 'CAFE',
              count: 9,
              amounts: [{ amount: 45, currency: 'EGP', count: 6 }],
              others: 3,
            },
            { merchant: 'GYM', count: 5, amounts: [{ amount: 300, currency: 'EGP', count: 5 }], others: 0 },
          ],
          minRepeats: 5,
        }),
      ),
    )
    const { user } = renderApp('/categories')
    const panel = await screen.findByRole('region', { name: 'Suggested categories' })
    expect(within(panel).queryByRole('listitem', { name: 'CAFE' })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: /Suggested categories/ }))
    const cafe = within(panel).getByRole('listitem', { name: 'CAFE' })
    expect(cafe).toHaveTextContent('9 debits')
    expect(cafe).toHaveTextContent('45 EGP × 6')
    expect(cafe).toHaveTextContent('Others × 3')
    const gym = within(panel).getByRole('listitem', { name: 'GYM' })
    expect(gym).toHaveTextContent('300 EGP × 5')
    expect(gym).not.toHaveTextContent('Others')
  })

  it('shows no suggestion panel when nothing repeats enough', async () => {
    renderApp('/categories')
    await list()
    expect(screen.queryByRole('region', { name: 'Suggested categories' })).not.toBeInTheDocument()
  })

  describe('adding a suggestion', () => {
    const suggest = () =>
      server.use(
        http.get('*/api/categories/suggestions', () =>
          HttpResponse.json({
            suggestions: [{ merchant: 'CAFE', count: 6, amounts: [], others: 6 }],
            minRepeats: 5,
          }),
        ),
      )
    const openCafe = async () => {
      const view = renderApp('/categories')
      const panel = await screen.findByRole('region', { name: 'Suggested categories' })
      await view.user.click(within(panel).getByRole('button', { name: /Suggested categories/ }))
      return { ...view, cafe: within(panel).getByRole('listitem', { name: 'CAFE' }) }
    }

    it('creates a category named after the merchant, then maps the merchant to it', async () => {
      suggest()
      const created = bodiesOf('post', '*/api/categories')
      const mapped = bodiesOf('put', '*/api/merchant-categories')
      const { user, cafe } = await openCafe()
      await user.click(within(cafe).getByRole('button', { name: 'Add CAFE' }))
      await waitFor(() => expect(mapped).toHaveLength(1))
      expect(created).toEqual([{ name: 'CAFE' }])
      expect(mapped[0]).toMatchObject({ merchant: 'CAFE' })
    })

    it('maps the merchant to the chosen existing category without creating one', async () => {
      suggest()
      const created = bodiesOf('post', '*/api/categories')
      const mapped = bodiesOf('put', '*/api/merchant-categories')
      const { user, cafe } = await openCafe()
      await user.selectOptions(within(cafe).getByRole('combobox', { name: 'Category for CAFE' }), 'Dining')
      await user.click(within(cafe).getByRole('button', { name: 'Add CAFE' }))
      await waitFor(() => expect(mapped).toHaveLength(1))
      expect(created).toEqual([])
      expect(mapped[0]).toMatchObject({
        merchant: 'CAFE',
        categoryId: api.categories.find((c) => c.name === 'Dining')!.id,
      })
    })

    it('shows why it could not be added', async () => {
      suggest()
      server.use(
        http.post('*/api/categories', () =>
          HttpResponse.json({ error: 'category "CAFE" already exists' }, { status: 409 }),
        ),
      )
      const { user, cafe } = await openCafe()
      await user.click(within(cafe).getByRole('button', { name: 'Add CAFE' }))
      expect(await within(cafe).findByRole('alert')).toHaveTextContent('already exists')
    })
  })
})
