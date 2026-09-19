import { screen, within } from '@testing-library/react'
import { http, HttpResponse, delay } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../server'
import { currentUrl, renderApp } from '../render'
import { balance } from '../fixtures'

const rowText = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent)

describe('Balances page', () => {
  it('shows one row per account and a total per currency', async () => {
    renderApp('/balances?yearMonth=2026-01')
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Account', 'Opening', 'Credits', 'Debits', 'Transfers In', 'Transfers Out', 'Closing', 'Last Reported', 'Discrepancy',
    ]) // prettier-ignore
    const [, accounts, totals] = within(table).getAllByRole('rowgroup')
    expect(within(accounts).getAllByRole('row').map(rowText)).toEqual([
      ['Credit Card', '0', '0', '250', '250', '0', '0', '4,750', '-4,750'],
      ['Checking', '1,000', '5,000', '250', '0', '0', '5,750', '5,750', '0'],
      ['Savings (USD)', '0', '20', '0', '0', '0', '20', '—', '—'],
    ])
    // Two EGP accounts get a tagged total; the lone USD account's total is untagged.
    expect(within(totals).getAllByRole('row').map(rowText)).toEqual([
      ['Total (EGP)', '1,000', '5,000', '500', '250', '0', '5,750', '—', '-4,750'],
      ['Total', '0', '20', '0', '0', '0', '20', '—', '—'],
    ])
  })

  it('highlights a discrepancy only when it is more than rounding', async () => {
    renderApp('/balances?yearMonth=2026-01')
    await screen.findByRole('table')
    const [cardDiscrepancy] = screen.getAllByText('-4,750')
    expect(cardDiscrepancy).toHaveClass('text-warning')
    const checking = screen.getByText('Checking').closest('tr')!
    expect(within(checking).getAllByRole('cell').at(-1)).toHaveClass('text-muted')
  })

  it('shows the empty state for a month with no snapshots', async () => {
    renderApp('/balances?yearMonth=2025-01')
    expect(await screen.findByText('No balance snapshots for this month.')).toBeInTheDocument()
  })

  it('shows the API error', async () => {
    server.use(http.get('*/api/balances', () => HttpResponse.json({ error: 'no snapshots table' }, { status: 500 })))
    renderApp('/balances?yearMonth=2026-01')
    expect(await screen.findByText('no snapshots table')).toBeInTheDocument()
  })

  it('holds back totals until it knows each account’s currency', async () => {
    server.use(
      http.get('*/api/accounts', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderApp('/balances?yearMonth=2026-01')
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('rowgroup')).toHaveLength(2)
    expect(within(table).getByText('checking')).toBeInTheDocument()
  })

  it('moves between months', async () => {
    const { user } = renderApp('/balances?yearMonth=2026-01')
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByText('No balance snapshots for this month.')).toBeInTheDocument()
    expect(currentUrl().searchParams.get('yearMonth')).toBe('2026-02')
  })

  it('totals only the currencies present, and counts an unknown account in the default currency', async () => {
    server.use(
      http.get('*/api/balances', () =>
        HttpResponse.json({
          yearMonth: '2026-01',
          count: 2,
          balances: [
            balance({ account: 'checking', closingBalance: 10 }),
            balance({ account: 'ghost', closingBalance: 5 }),
          ],
        }),
      ),
    )
    renderApp('/balances?yearMonth=2026-01')
    const table = await screen.findByRole('table')
    const [, accounts, totals] = within(table).getAllByRole('rowgroup')
    expect(
      within(accounts)
        .getAllByRole('row')
        .map((r) => rowText(r)[0]),
    ).toEqual(['Checking', 'ghost'])
    expect(within(totals).getAllByRole('row').map(rowText)).toEqual([
      ['Total (EGP)', '0', '0', '0', '0', '0', '15', '—', '—'],
    ])
  })
})
