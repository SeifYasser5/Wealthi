import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import type { ImportResponse } from '@wealthi/shared'
import { describe, expect, it } from 'vitest'
import { DashboardPage } from '../../src/pages/DashboardPage'
import { IMPORT_REPORT } from '../fixtures'
import { newQueryClient, renderApp } from '../render'
import { api, server } from '../server'

const importButton = () => screen.getByRole('button', { name: /run import|importing/i })
const report = () => screen.findByRole('region', { name: 'Import report' })
const imports = () => api.requests.filter((u) => u.pathname === '/api/import').length

/** Answers POST /api/import only when `release` is called, to hold an import open. */
function holdImport(body: ImportResponse = IMPORT_REPORT) {
  let release!: () => void
  const released = new Promise<void>((r) => (release = r))
  server.use(
    http.post('*/api/import', async ({ request }) => {
      api.requests.push(new URL(request.url))
      await released
      return HttpResponse.json(body)
    }),
  )
  return () => release()
}

function respondWith(body: ImportResponse) {
  server.use(http.post('*/api/import', () => HttpResponse.json(body)))
}

describe('Dashboard page', () => {
  it('is in the nav bar and starts with no import run', async () => {
    const { user } = renderApp('/transactions')
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Dashboard' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/no import run yet/i)).toBeInTheDocument()
    expect(importButton()).toHaveTextContent('Run import')
    expect(imports()).toBe(0)
  })

  it('keeps loading while the import runs, then reports it', async () => {
    const release = holdImport()
    const { user } = renderApp('/dashboard')
    await user.click(importButton())

    expect(importButton()).toBeDisabled()
    expect(importButton()).toHaveTextContent('Importing…')
    expect(screen.getByText(/the ledger is being rebuilt/)).toHaveAttribute('role', 'status')

    release()
    const card = await report()
    expect(within(card).getByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Rebuilt 3 months of balances from 42 transactions.')
    const stats = within(card)
      .getAllByRole('definition')
      .map((d) => d.textContent)
    expect(stats).toEqual(['3', '42', '0', '2.3 s'])
    expect(card).toHaveTextContent('/data/chat.db · finished Feb 01, 2026')
    expect(within(card).queryByRole('list')).not.toBeInTheDocument()
    expect(importButton()).toBeEnabled()
  })

  it('can be run again, each run replacing the last report', async () => {
    const { user } = renderApp('/dashboard')
    await user.click(importButton())
    await report()

    respondWith({ ...IMPORT_REPORT, totalStored: 50 })
    await user.click(importButton())
    expect(await screen.findByText(/from 50 transactions/)).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Import report' })).toHaveLength(1)
    expect(imports()).toBe(1) // the second call went to the override, which doesn't record
  })

  it('still shows a running import after leaving the page and coming back', async () => {
    const release = holdImport()
    const { user } = renderApp('/dashboard')
    await user.click(importButton())

    const nav = screen.getByRole('navigation')
    await user.click(within(nav).getByRole('link', { name: 'Balances' }))
    await screen.findByRole('heading', { name: 'Balances', level: 1 })
    await user.click(within(nav).getByRole('link', { name: 'Dashboard' }))

    expect(importButton()).toBeDisabled()
    expect(screen.getByText(/the ledger is being rebuilt/)).toHaveAttribute('role', 'status')
    release()
    expect(await report()).toHaveTextContent('Import complete')
    expect(imports()).toBe(1)
  })

  it('is still a success with parse errors, listing each unparsed message', async () => {
    respondWith({
      ...IMPORT_REPORT,
      parseErrors: [
        { sender: 'Test Bank', messageDate: '2026-01-05T09:30:00.000Z', text: 'PAID 10.00 AT SHOP', reason: 'no enabled pattern matched' },
        { sender: 'Other Bank', messageDate: '2026-01-06T09:30:00.000Z', text: 'ODD', reason: 'bad amount' },
      ],
    }) // prettier-ignore
    const { user } = renderApp('/dashboard')
    await user.click(importButton())
    const card = await report()

    expect(within(card).getByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    expect(card).toHaveTextContent(
      'Rebuilt 3 months of balances from 42 transactions. 2 messages not parsed, listed below.',
    )
    expect(card.querySelector('svg')).toHaveClass('text-positive')
    const items = within(card).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Test Bank')
    expect(items[0]).toHaveTextContent('Jan 05, 2026')
    expect(items[0]).toHaveTextContent('no enabled pattern matched')
    expect(items[0]).toHaveTextContent('PAID 10.00 AT SHOP')
  })

  it('says where it looked when there is no chat.db', async () => {
    respondWith({ ...IMPORT_REPORT, status: 'skipped', months: 0, totalStored: 0, source: '/missing/chat.db' })
    const { user } = renderApp('/dashboard')
    await user.click(importButton())
    const card = await report()
    expect(within(card).getByRole('heading', { name: 'Import skipped' })).toBeInTheDocument()
    expect(card).toHaveTextContent('No chat.db found at /missing/chat.db.')
  })

  it('says the ledger was kept when chat.db held no transactions', async () => {
    respondWith({ ...IMPORT_REPORT, months: 0, totalStored: 0 })
    const { user } = renderApp('/dashboard')
    await user.click(importButton())
    const card = await report()
    expect(within(card).getByRole('heading', { name: 'Nothing imported' })).toBeInTheDocument()
    expect(card).toHaveTextContent('the stored ledger was kept')
  })

  it('shows why an import failed, and lets you try again', async () => {
    server.use(http.post('*/api/import', () => HttpResponse.json({ error: 'import failed: db down' }, { status: 500 })))
    const { user } = renderApp('/dashboard')
    await user.click(importButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('import failed: db down')
    expect(importButton()).toBeEnabled()

    server.resetHandlers()
    await user.click(importButton())
    expect(await report()).toHaveTextContent('Import complete')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('marks the ledger queries stale once an import finishes, but not the config ones', async () => {
    const client = newQueryClient()
    for (const key of ['transactions', 'balances', 'spending', 'accounts']) client.setQueryData([key], {})
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await user.click(importButton())
    await report()

    const invalidated = (key: string) => client.getQueryState([key])?.isInvalidated
    expect(['transactions', 'balances', 'spending'].map(invalidated)).toEqual([true, true, true])
    expect(invalidated('accounts')).toBe(false)
  })
})
