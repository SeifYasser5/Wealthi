import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../render'
import { api, server } from '../server'

const JAN = '/settings?yearMonth=2026-01'

/** Opens Settings on the Manual section. */
async function renderManual(path = JAN) {
  const view = renderApp(path)
  await view.user.click(await screen.findByRole('radio', { name: 'Manual' }))
  return view
}
const list = () => screen.findByRole('list', { name: 'Your manual transactions' })
const row = (name: string) => screen.getByRole('listitem', { name })
const rowNames = () =>
  within(screen.getByRole('list', { name: 'Your manual transactions' }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)

/** Captures the JSON body of every `method path` request, then lets the default handler answer. */
function bodiesOf(method: 'post' | 'put', path: string) {
  const bodies: unknown[] = []
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.clone().json())
      return undefined
    }),
  )
  return bodies
}

const failWith = (method: 'post' | 'put' | 'delete', error: string) =>
  server.use(http[method]('*/api/manual-transactions*', () => HttpResponse.json({ error }, { status: 400 })))

/** Sets a date input; jsdom's date inputs don't take typed keys. */
const setDate = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } })

describe('Manual transactions (Settings page)', () => {
  it('is a Settings section and lists every manual transaction', async () => {
    const { user } = renderApp('/transactions?yearMonth=2026-01')
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Settings' }))
    await user.click(await screen.findByRole('radio', { name: 'Manual' }))

    await list()
    expect(rowNames()).toEqual(['CASHBACK', 'Bank fee'])
    expect(row('Bank fee')).toHaveTextContent('Jan 15, 2026 · Checking · Rent')
    expect(within(row('Bank fee')).getByText('−50 EGP')).toHaveClass('text-negative')
    expect(within(row('CASHBACK')).getByText('+5 EGP')).toHaveClass('text-positive')
  })

  it('says so when there are none', async () => {
    api.manualTransactions = []
    await renderManual()
    expect(await screen.findByText('No manual transactions this month.')).toBeInTheDocument()
  })

  it('follows the month navigator, which also sits at the top right', async () => {
    const { user } = await renderManual()
    await list()
    expect(screen.getByRole('heading', { name: 'January 2026' })).toBeInTheDocument()
    expect(api.queries('/api/manual-transactions').at(-1)?.get('yearMonth')).toBe('2026-01')

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('No manual transactions this month.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'February 2026' })).toBeInTheDocument()
    expect(api.queries('/api/manual-transactions').at(-1)?.get('yearMonth')).toBe('2026-02')

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await list()
    expect(rowNames()).toEqual(['CASHBACK', 'Bank fee'])
  })

  it('shows why the list could not load', async () => {
    server.use(
      http.get('*/api/manual-transactions', () => HttpResponse.json({ error: 'database down' }, { status: 500 })),
    )
    await renderManual()
    expect(await screen.findByText('database down')).toBeInTheDocument()
  })
})

describe('adding a manual transaction', () => {
  it('sends the form, trimmed, and lists the new one', async () => {
    const bodies = bodiesOf('post', '*/api/manual-transactions')
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'New transaction' }))
    const form = screen.getByRole('form', { name: 'New manual transaction' })
    const add = within(form).getByRole('button', { name: 'Add transaction' })
    expect(add).toBeDisabled()

    await user.click(within(form).getByRole('radio', { name: 'Money in' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), '  REFUND ')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '30.5')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'savings_usd')
    expect(within(form).getByText('Amount (USD)')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Dining')
    setDate('Date', '2026-01-03')
    await user.click(add)

    await waitFor(() =>
      expect(bodies).toEqual([
        { type: 'credit', amount: 30.5, account: 'savings_usd', merchant: 'REFUND', categoryId: 1, date: '2026-01-03' },
      ]),
    )
    expect(await screen.findByRole('listitem', { name: 'REFUND' })).toHaveTextContent('Savings (USD) · Dining')
    expect(screen.queryByRole('form', { name: 'New manual transaction' })).not.toBeInTheDocument()
  })

  it('defaults to money out, from today, on the first account, with no category', async () => {
    const bodies = bodiesOf('post', '*/api/manual-transactions')
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'New transaction' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'FEE')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))

    const now = new Date()
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0'))
    await waitFor(() =>
      expect(bodies).toEqual([
        expect.objectContaining({ type: 'debit', account: 'checking', categoryId: null, date: today.join('-') }),
      ]),
    )
  })

  it('needs a date', async () => {
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'New transaction' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'FEE')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeEnabled()
    setDate('Date', '')
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeDisabled()
  })

  it('waits for the accounts before it can be sent', async () => {
    server.use(http.get('*/api/accounts', () => new Promise<never>(() => {})))
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'New transaction' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'FEE')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeDisabled()
  })

  it('shows why it was refused, and keeps the form', async () => {
    failWith('post', 'category 9 does not exist')
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'New transaction' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'FEE')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('category 9 does not exist')
    expect(screen.getByRole('form', { name: 'New manual transaction' })).toBeInTheDocument()
  })

  it('closes on Cancel without sending anything', async () => {
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'New transaction' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(api.queries('/api/manual-transactions')).toHaveLength(1)
  })
})

describe('editing a manual transaction', () => {
  it('starts from the stored values and replaces it', async () => {
    const bodies = bodiesOf('put', '*/api/manual-transactions/:id')
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'Edit Bank fee' }))
    const form = screen.getByRole('form', { name: 'Edit Bank fee' })
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(50)
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('3')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-15')

    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    await user.clear(amount)
    await user.type(amount, '60')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'No category')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(bodies).toEqual([
        { type: 'debit', amount: 60, account: 'checking', merchant: 'Bank fee', categoryId: null, date: '2026-01-15' },
      ]),
    )
    await waitFor(() => expect(within(row('Bank fee')).getByText('−60 EGP')).toBeInTheDocument())
  })

  it('starts a transaction with no category on none, and shows a refusal', async () => {
    failWith('put', 'merchant is required')
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'Edit CASHBACK' }))
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('merchant is required')
  })

  it('goes back to the row on Cancel', async () => {
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'Edit CASHBACK' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(within(row('CASHBACK')).getByRole('button', { name: 'Edit CASHBACK' })).toBeInTheDocument()
  })
})

describe('deleting a manual transaction', () => {
  it('asks first, then deletes it', async () => {
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'Delete CASHBACK' }))
    expect(row('CASHBACK')).toHaveTextContent('Delete CASHBACK? The next import removes it from the ledger.')
    expect(screen.getByRole('button', { name: 'Delete CASHBACK' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(rowNames()).toEqual(['Bank fee']))
  })

  it('keeps it when asked to, and shows a refusal', async () => {
    failWith('delete', 'manual transaction 2 not found')
    const { user } = await renderManual()
    await list()
    await user.click(screen.getByRole('button', { name: 'Delete CASHBACK' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete CASHBACK' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('manual transaction 2 not found')
    expect(rowNames()).toEqual(['CASHBACK', 'Bank fee'])
  })
})
