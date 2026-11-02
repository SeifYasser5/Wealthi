import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../render'
import { api, server } from '../server'

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

const failWith = (method: 'post' | 'put' | 'delete', path: string, error: string) =>
  server.use(http[method](path, () => HttpResponse.json({ error }, { status: 400 })))

const row = (name: string) => screen.getByRole('listitem', { name })
const names = (list: string) =>
  within(screen.getByRole('list', { name: list }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)

async function open(section: string) {
  const view = renderApp('/transactions')
  await view.user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Settings' }))
  expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
  if (section !== 'Senders') await view.user.click(screen.getByRole('radio', { name: section }))
  return view
}

describe('Settings page', () => {
  it('is in the nav bar and opens on the senders', async () => {
    await open('Senders')
    expect(await screen.findByRole('list', { name: 'Your senders' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Senders' })).toBeChecked()
  })

  it('switches between its four sections', async () => {
    const { user } = await open('Accounts')
    await user.click(screen.getByRole('radio', { name: 'Sources' }))
    expect(await screen.findByRole('list', { name: 'Your sources' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Transfer rules' }))
    expect(await screen.findByRole('list', { name: 'Your transfer rules' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Senders' }))
    expect(await screen.findByRole('list', { name: 'Your senders' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Accounts' }))
    expect(await screen.findByRole('list', { name: 'Your accounts' })).toBeInTheDocument()
  })
})

describe('Accounts', () => {
  it('shows each account with its id, currency and opening balance', async () => {
    await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    expect(row('Checking')).toHaveTextContent('checking · EGP')
    expect(within(row('Checking')).getByText('1,000 EGP')).toBeInTheDocument()
    expect(within(row('Credit Card')).getByText('-250 EGP')).toBeInTheDocument()
  })

  it('says so when there are none', async () => {
    api.accounts = []
    await open('Accounts')
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument()
  })

  it('adds one, with a negative opening balance, and lists it everywhere', async () => {
    const bodies = bodiesOf('post', '*/api/accounts')
    const { user } = await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    await user.click(screen.getByRole('button', { name: 'New account' }))
    const form = screen.getByRole('form', { name: 'New account' })
    const add = within(form).getByRole('button', { name: 'Add account' })
    expect(add).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'Id' }), ' wallet ')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Wallet ')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'USD')
    expect(within(form).getByText('Opening balance (USD)')).toBeInTheDocument()
    await user.clear(screen.getByRole('spinbutton', { name: 'Opening balance' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Opening balance' }), '-12.5')
    await user.click(add)

    await waitFor(() =>
      expect(bodies).toEqual([{ id: 'wallet', label: 'Wallet', currency: 'USD', openingBalance: -12.5 }]),
    )
    expect(await screen.findByRole('listitem', { name: 'Wallet' })).toHaveTextContent('wallet · USD')
    expect(screen.queryByRole('form', { name: 'New account' })).not.toBeInTheDocument()
  })

  it('needs an id, a name and a balance', async () => {
    const { user } = await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    await user.click(screen.getByRole('button', { name: 'New account' }))
    const add = screen.getByRole('button', { name: 'Add account' })
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Wallet')
    expect(add).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Id' }), 'wallet')
    expect(add).toBeEnabled()
    await user.clear(screen.getByRole('spinbutton', { name: 'Opening balance' }))
    expect(add).toBeDisabled()
  })

  it('shows why it was refused, keeps the form, and closes on Cancel', async () => {
    const { user } = await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    await user.click(screen.getByRole('button', { name: 'New account' }))
    await user.type(screen.getByRole('textbox', { name: 'Id' }), 'checking')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Again')
    await user.click(screen.getByRole('button', { name: 'Add account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('account "checking" already exists')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('edits the name and opening balance, but not the id or currency', async () => {
    const bodies = bodiesOf('put', '*/api/accounts/:id')
    const { user } = await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    await user.click(screen.getByRole('button', { name: 'Edit Checking' }))
    const form = screen.getByRole('form', { name: 'Edit Checking' })
    expect(within(form).queryByRole('textbox', { name: 'Id' })).not.toBeInTheDocument()
    expect(within(form).queryByRole('combobox', { name: 'Currency' })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Opening balance' })).toHaveValue(1000)

    const name = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Main')
    const balance = screen.getByRole('spinbutton', { name: 'Opening balance' })
    await user.clear(balance)
    await user.type(balance, '2500.25')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(bodies).toEqual([{ label: 'Main', openingBalance: 2500.25 }]))
    expect(await screen.findByRole('listitem', { name: 'Main' })).toHaveTextContent('2,500 EGP')
  })

  it('shows a refused edit and goes back on Cancel', async () => {
    failWith('put', '*/api/accounts/:id', 'label is required')
    const { user } = await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    await user.click(screen.getByRole('button', { name: 'Edit Checking' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('label is required')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(within(row('Checking')).getByRole('button', { name: 'Edit Checking' })).toBeInTheDocument()
  })

  it('deletes an account nothing uses, after asking', async () => {
    const { user } = await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    await user.click(screen.getByRole('button', { name: 'Delete Savings (USD)' }))
    expect(row('Savings (USD)')).toHaveTextContent('Delete Savings (USD)? Only an account with no transactions')
    expect(screen.getByRole('button', { name: 'Delete Savings (USD)' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(names('Your accounts')).toEqual(['Checking', 'Credit Card']))
  })

  it('keeps it when asked to, and shows what still uses one it cannot delete', async () => {
    const { user } = await open('Accounts')
    await screen.findByRole('list', { name: 'Your accounts' })
    await user.click(screen.getByRole('button', { name: 'Delete Checking' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Checking' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('"checking" is used by 1 source; remove them first')
    expect(names('Your accounts')).toHaveLength(3)
  })
})

describe('Sources', () => {
  it('lists each key with the account it lands on', async () => {
    await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    expect(names('Your sources')).toEqual(['test-bank:1111', 'test-bank:2222'])
    expect(screen.getByRole('combobox', { name: 'Account for test-bank:2222' })).toHaveValue('card')
  })

  it('says so when there are none', async () => {
    api.accountSources = []
    await open('Sources')
    expect(await screen.findByText(/No sources yet/)).toBeInTheDocument()
  })

  it('maps a new key to an account, trimmed, and clears the field', async () => {
    const bodies = bodiesOf('put', '*/api/account-sources')
    const { user } = await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    const submit = screen.getByRole('button', { name: 'Map source' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Source key' }), ' test-bank:3333 ')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'savings_usd')
    await user.click(submit)

    await waitFor(() => expect(bodies).toEqual([{ source: 'test-bank:3333', account: 'savings_usd' }]))
    await waitFor(() => expect(names('Your sources')).toContain('test-bank:3333'))
    expect(screen.getByRole('textbox', { name: 'Source key' })).toHaveValue('')
  })

  it('maps to the first account unless another is chosen', async () => {
    const bodies = bodiesOf('put', '*/api/account-sources')
    const { user } = await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    await user.type(screen.getByRole('textbox', { name: 'Source key' }), 'x:1')
    await user.click(screen.getByRole('button', { name: 'Map source' }))
    await waitFor(() => expect(bodies).toEqual([{ source: 'x:1', account: 'checking' }]))
  })

  it('waits for the accounts before it can be sent', async () => {
    server.use(http.get('*/api/accounts', () => new Promise<never>(() => {})))
    const { user } = await open('Sources')
    await user.type(screen.getByRole('textbox', { name: 'Source key' }), 'x:1')
    expect(screen.getByRole('button', { name: 'Map source' })).toBeDisabled()
  })

  it('shows why it was refused', async () => {
    failWith('put', '*/api/account-sources', 'account "checking" does not exist')
    const { user } = await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    await user.type(screen.getByRole('textbox', { name: 'Source key' }), 'x:1')
    await user.click(screen.getByRole('button', { name: 'Map source' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('account "checking" does not exist')
  })

  it('moves a key to another account from its row', async () => {
    const bodies = bodiesOf('put', '*/api/account-sources')
    const { user } = await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account for test-bank:1111' }), 'savings_usd')
    await waitFor(() => expect(bodies).toEqual([{ source: 'test-bank:1111', account: 'savings_usd' }]))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Account for test-bank:1111' })).toHaveValue('savings_usd'),
    )
  })

  it('shows why a move was refused', async () => {
    failWith('put', '*/api/account-sources', 'nope')
    const { user } = await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account for test-bank:1111' }), 'card')
    expect(await screen.findByRole('alert')).toHaveTextContent('nope')
  })

  it('removes a key after asking, or keeps it', async () => {
    const { user } = await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    await user.click(screen.getByRole('button', { name: 'Remove test-bank:1111' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(names('Your sources')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Remove test-bank:1111' }))
    expect(row('test-bank:1111')).toHaveTextContent('Messages on it become parse errors')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(names('Your sources')).toEqual(['test-bank:2222']))
  })

  it('shows why a removal was refused', async () => {
    failWith('delete', '*/api/account-sources/:source', 'source not found')
    const { user } = await open('Sources')
    await screen.findByRole('list', { name: 'Your sources' })
    await user.click(screen.getByRole('button', { name: 'Remove test-bank:1111' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('source not found')
  })
})

describe('Transfer rules', () => {
  it('lists each rule in plain words', async () => {
    await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    expect(names('Your transfer rules')).toEqual(['CARD PAYMENT on Checking', 'Any merchant on Savings (USD)'])
    expect(row('CARD PAYMENT on Checking')).toHaveTextContent('Money out of Checking · to Credit Card')
    expect(row('Any merchant on Savings (USD)')).toHaveTextContent('Money in to Savings (USD) · from Checking')
  })

  it('says so when there are none', async () => {
    api.transferRules = []
    await open('Transfer rules')
    expect(await screen.findByText(/No transfer rules yet/)).toBeInTheDocument()
  })

  it('adds one, defaulting to the first two accounts and any merchant', async () => {
    const bodies = bodiesOf('post', '*/api/transfer-rules')
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'New rule' }))
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('checking')
    expect(screen.getByRole('combobox', { name: 'Other account' })).toHaveValue('card')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    await waitFor(() =>
      expect(bodies).toEqual([{ account: 'checking', type: 'debit', merchant: '', counterAccount: 'card' }]),
    )
    expect(await screen.findByRole('listitem', { name: 'Any merchant on Checking' })).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('sends the direction, the accounts and the merchant exactly as typed', async () => {
    const bodies = bodiesOf('post', '*/api/transfer-rules')
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'New rule' }))
    await user.click(screen.getByRole('radio', { name: 'Money in' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'card')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Other account' }), 'savings_usd')
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), ' ATM ')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))
    await waitFor(() =>
      expect(bodies).toEqual([{ account: 'card', type: 'credit', merchant: ' ATM ', counterAccount: 'savings_usd' }]),
    )
  })

  it('needs two different accounts', async () => {
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'New rule' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Other account' }), 'checking')
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
  })

  it('waits for the accounts before it can be sent', async () => {
    server.use(http.get('*/api/accounts', () => new Promise<never>(() => {})))
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'New rule' }))
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
  })

  it('shows why it was refused, and closes on Cancel', async () => {
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'New rule' }))
    await user.type(screen.getByRole('textbox', { name: 'Merchant' }), 'CARD PAYMENT')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('a debit rule for "CARD PAYMENT" on "checking" already exists') // prettier-ignore
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('edits one from its stored values', async () => {
    const bodies = bodiesOf('put', '*/api/transfer-rules/:id')
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'Edit CARD PAYMENT on Checking' }))
    expect(screen.getByRole('radio', { name: 'Money out' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Other account' })).toHaveValue('card')
    const merchant = screen.getByRole('textbox', { name: 'Merchant' })
    expect(merchant).toHaveValue('CARD PAYMENT')
    await user.clear(merchant)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(bodies).toEqual([{ account: 'checking', type: 'debit', merchant: '', counterAccount: 'card' }]),
    )
    expect(await screen.findByRole('listitem', { name: 'Any merchant on Checking' })).toBeInTheDocument()
  })

  it('goes back to the row on Cancel', async () => {
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'Edit CARD PAYMENT on Checking' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('deletes one after asking, or keeps it, and shows a refusal', async () => {
    const { user } = await open('Transfer rules')
    await screen.findByRole('list', { name: 'Your transfer rules' })
    await user.click(screen.getByRole('button', { name: 'Delete CARD PAYMENT on Checking' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(names('Your transfer rules')).toHaveLength(2)

    failWith('delete', '*/api/transfer-rules/:id', 'transfer rule 1 not found')
    await user.click(screen.getByRole('button', { name: 'Delete CARD PAYMENT on Checking' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('transfer rule 1 not found')

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(names('Your transfer rules')).toEqual(['Any merchant on Savings (USD)']))
  })
})

describe('Senders', () => {
  it('lists each sender', async () => {
    await open('Senders')
    await screen.findByRole('list', { name: 'Your senders' })
    expect(names('Your senders')).toEqual(['+15550001111', 'Test Bank'])
  })

  it('says so when there are none', async () => {
    api.bankSenders = []
    await open('Senders')
    expect(await screen.findByText(/No senders yet/)).toBeInTheDocument()
  })

  it('adds one, trimmed, and clears the field', async () => {
    const bodies = bodiesOf('post', '*/api/bank-senders')
    const { user } = await open('Senders')
    await screen.findByRole('list', { name: 'Your senders' })
    const submit = screen.getByRole('button', { name: 'Add sender' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Sender' }), ' Another Bank ')
    await user.click(submit)
    await waitFor(() => expect(bodies).toEqual([{ sender: 'Another Bank' }]))
    await waitFor(() => expect(names('Your senders')).toEqual(['+15550001111', 'Another Bank', 'Test Bank']))
    expect(screen.getByRole('textbox', { name: 'Sender' })).toHaveValue('')
  })

  it('shows why it was refused', async () => {
    const { user } = await open('Senders')
    await screen.findByRole('list', { name: 'Your senders' })
    await user.type(screen.getByRole('textbox', { name: 'Sender' }), 'Test Bank')
    await user.click(screen.getByRole('button', { name: 'Add sender' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('sender "Test Bank" already exists')
  })

  it('removes one after asking, or keeps it, and shows a refusal', async () => {
    const { user } = await open('Senders')
    await screen.findByRole('list', { name: 'Your senders' })
    await user.click(screen.getByRole('button', { name: 'Remove Test Bank' }))
    expect(row('Test Bank')).toHaveTextContent('Its messages are no longer imported or learned from')
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(names('Your senders')).toHaveLength(2)

    failWith('delete', '*/api/bank-senders/:sender', 'sender "Test Bank" not found')
    await user.click(screen.getByRole('button', { name: 'Remove Test Bank' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('sender "Test Bank" not found')

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(names('Your senders')).toEqual(['+15550001111']))
  })

  it('addresses a phone number by its URL-encoded name', async () => {
    const { user } = await open('Senders')
    await screen.findByRole('list', { name: 'Your senders' })
    await user.click(screen.getByRole('button', { name: 'Remove +15550001111' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(names('Your senders')).toEqual(['Test Bank']))
    expect(api.requests.some((u) => u.pathname === '/api/bank-senders/%2B15550001111')).toBe(true)
  })
})
