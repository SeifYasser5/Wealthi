import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../render'
import { api, server } from '../server'

const list = () => screen.findByRole('list', { name: 'Your schedules' })
const row = (name: string) => screen.getByRole('listitem', { name })
const rowNames = () =>
  within(screen.getByRole('list', { name: 'Your schedules' }))
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
  server.use(http[method]('*/api/schedules*', () => HttpResponse.json({ error }, { status: 400 })))

/** Sets a date input; jsdom's date inputs don't take typed keys. */
const setDate = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } })

describe('Schedules page', () => {
  it('is in the nav bar and lists every schedule with when it falls', async () => {
    const { user } = renderApp('/transactions')
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Schedules' }))
    expect(await screen.findByRole('heading', { name: 'Schedules', level: 1 })).toBeInTheDocument()

    await list()
    expect(rowNames()).toEqual(['INTEREST', 'RENT'])
    expect(row('RENT')).toHaveTextContent('Every month on the 31st · Checking · Rent')
    expect(row('RENT')).toHaveTextContent('From Jan 31, 2026 · Next Feb 28, 2026 · 1 transaction on the ledger')
    expect(within(row('RENT')).getByText('−1,500 EGP')).toHaveClass('text-negative')
    expect(row('INTEREST')).toHaveTextContent('Every 2 weeks on Monday · Savings (USD)')
    expect(row('INTEREST')).toHaveTextContent('From Dec 29, 2025 until Jan 26, 2026 · Ended · 3 transactions')
    expect(within(row('INTEREST')).getByText('+20 USD')).toHaveClass('text-positive')
  })

  it('says so when there are none', async () => {
    api.schedules = []
    renderApp('/schedules')
    expect(
      await screen.findByText('No schedules yet. Add one for anything that repeats without a bank message.'),
    ).toBeInTheDocument()
  })

  it('shows why the list could not load', async () => {
    server.use(http.get('*/api/schedules', () => HttpResponse.json({ error: 'database down' }, { status: 500 })))
    renderApp('/schedules')
    expect(await screen.findByText('database down')).toBeInTheDocument()
  })
})

describe('adding a schedule', () => {
  it('sends the form, trimmed, and lists the new schedule', async () => {
    const bodies = bodiesOf('post', '*/api/schedules')
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    const form = screen.getByRole('form', { name: 'New schedule' })
    const add = within(form).getByRole('button', { name: 'Add schedule' })
    expect(add).toBeDisabled()

    await user.click(within(form).getByRole('radio', { name: 'Money in' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), '  GYM ')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '300.5')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'savings_usd')
    expect(within(form).getByText('Amount (USD)')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Dining')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency' }), 'weekly')
    setDate('Start date', '2026-03-02')
    setDate('End date', '2026-06-29')
    await user.click(add)

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          type: 'credit',
          amount: 300.5,
          account: 'savings_usd',
          merchant: 'GYM',
          categoryId: 1,
          frequency: 'weekly',
          interval: 1,
          startDate: '2026-03-02',
          endDate: '2026-06-29',
        },
      ]),
    )
    expect(await screen.findByRole('listitem', { name: 'GYM' })).toHaveTextContent('Every week on Monday')
    expect(row('GYM')).toHaveTextContent('Savings (USD) · Dining')
    expect(screen.queryByRole('form', { name: 'New schedule' })).not.toBeInTheDocument()
  })

  it('defaults to money out, monthly, from today, on the first account, with no category or end', async () => {
    const bodies = bodiesOf('post', '*/api/schedules')
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'RENT')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    await user.click(screen.getByRole('button', { name: 'Add schedule' }))

    const now = new Date()
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0'))
    await waitFor(() =>
      expect(bodies).toEqual([
        expect.objectContaining({
          type: 'debit',
          account: 'checking',
          categoryId: null,
          frequency: 'monthly',
          interval: 1,
          startDate: today.join('-'),
          endDate: null,
        }),
      ]),
    )
  })

  it('names the unit in the plural once the interval is more than one, and needs a whole interval', async () => {
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'RENT')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    const interval = screen.getByRole('spinbutton', { name: 'Interval' })
    const add = screen.getByRole('button', { name: 'Add schedule' })
    expect(screen.getByRole('option', { name: 'month' })).toBeInTheDocument()

    await user.clear(interval)
    await user.type(interval, '3')
    expect(screen.getByRole('option', { name: 'months' })).toBeInTheDocument()
    expect(add).toBeEnabled()

    for (const bad of ['0', '1.5']) {
      await user.clear(interval)
      await user.type(interval, bad)
      expect(add).toBeDisabled()
    }
    await user.clear(interval)
    await user.type(interval, '1')
    setDate('Start date', '')
    expect(add).toBeDisabled()
  })

  it('waits for the accounts before it can be sent', async () => {
    server.use(http.get('*/api/accounts', () => new Promise<never>(() => {})))
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'RENT')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    expect(screen.getByRole('button', { name: 'Add schedule' })).toBeDisabled()
  })

  it('shows why it was refused, and keeps the form', async () => {
    failWith('post', 'category 9 does not exist')
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'RENT')
    await user.type(screen.getByRole('spinbutton', { name: 'Amount' }), '10')
    await user.click(screen.getByRole('button', { name: 'Add schedule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('category 9 does not exist')
    expect(screen.getByRole('form', { name: 'New schedule' })).toBeInTheDocument()
  })

  it('closes on Cancel without sending anything', async () => {
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New schedule' })).toBeInTheDocument()
    expect(api.queries('/api/schedules')).toHaveLength(1)
  })
})

describe('editing a schedule', () => {
  it('starts from the stored values and replaces it', async () => {
    const bodies = bodiesOf('put', '*/api/schedules/:id')
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'Edit RENT' }))
    const form = screen.getByRole('form', { name: 'Edit RENT' })
    expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('RENT')
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(1500)
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('3')
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-31')
    expect(screen.getByLabelText('End date')).toHaveValue('')

    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    await user.clear(amount)
    await user.type(amount, '1600')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'No category')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency' }), 'yearly')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          type: 'debit',
          amount: 1600,
          account: 'checking',
          merchant: 'RENT',
          categoryId: null,
          frequency: 'yearly',
          interval: 1,
          startDate: '2026-01-31',
          endDate: null,
        },
      ]),
    )
    await waitFor(() => expect(row('RENT')).toHaveTextContent('Every year on Jan 31 · Checking'))
    expect(within(row('RENT')).getByText('−1,600 EGP')).toBeInTheDocument()
  })

  it('keeps an end date it already has, and shows a refusal', async () => {
    // Registered last, so it captures before the refusal answers.
    failWith('put', 'endDate must not be before startDate')
    const bodies = bodiesOf('put', '*/api/schedules/:id')
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'Edit INTEREST' }))
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('')
    expect(screen.getByRole('spinbutton', { name: 'Interval' })).toHaveValue(2)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('endDate must not be before startDate')
    expect(bodies).toEqual([expect.objectContaining({ endDate: '2026-01-26', interval: 2, categoryId: null })])
  })

  it('goes back to the row on Cancel', async () => {
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'Edit RENT' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(within(row('RENT')).getByRole('button', { name: 'Edit RENT' })).toBeInTheDocument()
  })
})

describe('deleting a schedule', () => {
  it('asks first, saying what leaves the ledger, then deletes it', async () => {
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'Delete RENT' }))
    expect(row('RENT')).toHaveTextContent('Delete RENT? The next import removes its 1 transaction from the ledger.')
    expect(screen.getByRole('button', { name: 'Delete RENT' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(rowNames()).toEqual(['INTEREST']))
    expect(api.requests.some((u) => u.pathname === '/api/schedules/1')).toBe(true)
  })

  it('says nothing about the ledger when no transaction is stored yet', async () => {
    api.schedules[1].transactionCount = 0
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'Delete RENT' }))
    expect(row('RENT')).toHaveTextContent(/Delete RENT\?Keep it/)
  })

  it('keeps it when asked to', async () => {
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'Delete RENT' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByText(/Delete RENT\?/)).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['INTEREST', 'RENT'])
  })

  it('shows why the delete failed', async () => {
    failWith('delete', 'schedule 1 not found')
    const { user } = renderApp('/schedules')
    await list()
    await user.click(screen.getByRole('button', { name: 'Delete RENT' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('schedule 1 not found')
  })
})

describe('scheduled transactions on the ledger', () => {
  it('marks the rows a schedule added, and links the detail to the Schedules page', async () => {
    const { user } = renderApp('/transactions?yearMonth=2026-01')
    const rows = (await screen.findAllByRole('row')).filter((r) => r.getAttribute('aria-haspopup') === 'dialog')
    expect(rows.map((r) => within(r).queryByText('Scheduled') !== null)).toEqual([false, false, false, true])

    await user.click(rows[3])
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('link', { name: 'A schedule' }))
    expect(await screen.findByRole('heading', { name: 'Schedules', level: 1 })).toBeInTheDocument()
  })
})

describe('suggested schedules', () => {
  const suggest = () =>
    server.use(
      http.get('*/api/schedules/suggestions', () =>
        HttpResponse.json({
          suggestions: [
            {
              merchant: 'NETFLIX',
              type: 'debit',
              currency: 'EGP',
              months: 4,
              accounts: [
                { account: 'checking', count: 3 },
                { account: 'savings_usd', count: 1 },
              ],
              min: 100,
              max: 120,
              average: 110,
              spread: 18.18,
              lastDate: '2026-04-07',
              nextDate: '2026-05-07',
            },
            {
              merchant: 'GYM',
              type: 'credit',
              currency: 'EGP',
              months: 3,
              accounts: [{ account: 'checking', count: 3 }],
              min: 300,
              max: 300,
              average: 300,
              spread: 0,
              lastDate: '2026-04-03',
              nextDate: '2026-05-03',
            },
          ],
          minMonths: 3,
        }),
      ),
    )
  const open = async () => {
    const view = renderApp('/schedules')
    await list()
    const panel = await screen.findByRole('region', { name: 'Suggested schedules' })
    await view.user.click(within(panel).getByRole('button', { name: /Suggested schedules/ }))
    return { ...view, panel }
  }

  it('lists the accounts each merchant was charged to and how much the amount varied', async () => {
    suggest()
    const { panel } = await open()
    const netflix = within(panel).getByRole('listitem', { name: 'NETFLIX' })
    expect(netflix).toHaveTextContent('4 months')
    expect(netflix).toHaveTextContent('Money out · about 110 EGP')
    expect(netflix).toHaveTextContent('100–120 EGP · varies by 18.18%')
    expect(netflix).toHaveTextContent('Checking × 3')
    expect(netflix).toHaveTextContent('Savings (USD) × 1')
    const gym = within(panel).getByRole('listitem', { name: 'GYM' })
    expect(gym).toHaveTextContent('Money in')
    expect(gym).toHaveTextContent('Always 300 EGP')
  })

  it('stays collapsed until opened', async () => {
    suggest()
    renderApp('/schedules')
    const panel = await screen.findByRole('region', { name: 'Suggested schedules' })
    expect(within(panel).queryByRole('listitem', { name: 'NETFLIX' })).not.toBeInTheDocument()
  })

  it('shows no panel when nothing repeats monthly', async () => {
    renderApp('/schedules')
    await list()
    expect(screen.queryByRole('region', { name: 'Suggested schedules' })).not.toBeInTheDocument()
  })

  it('fills the new schedule form from the suggestion, and sends it', async () => {
    suggest()
    const bodies = bodiesOf('post', '*/api/schedules')
    const { user, panel } = await open()
    await user.click(within(panel).getByRole('button', { name: 'Schedule NETFLIX' }))
    const form = screen.getByRole('form', { name: 'New schedule' })
    expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('NETFLIX')
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(110)
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-05-07')
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('checking')
    await user.click(within(form).getByRole('button', { name: 'Add schedule' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      type: 'debit',
      amount: 110,
      account: 'checking',
      merchant: 'NETFLIX',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-05-07',
      endDate: null,
    })
  })

  it('refills the form when another suggestion is chosen, and a blank form after cancel', async () => {
    suggest()
    const { user, panel } = await open()
    await user.click(within(panel).getByRole('button', { name: 'Schedule NETFLIX' }))
    await user.click(within(panel).getByRole('button', { name: 'Schedule GYM' }))
    expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('GYM')
    expect(screen.getByRole('radio', { name: 'Money in' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('')
  })
})
