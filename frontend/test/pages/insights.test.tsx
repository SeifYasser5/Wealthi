import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, server } from '../server'
import { currentUrl, renderApp } from '../render'
import { INSIGHTS_NOW } from '../fixtures'

// Every number below is worked out from INSIGHT_ROWS in fixtures.ts.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: INSIGHTS_NOW })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.useRealTimers())

const summary = () => within(screen.getByRole('region', { name: 'Summary' }))
const explore = () => within(screen.getByRole('region', { name: 'Explore' }))
const trends = () => within(screen.getByRole('region', { name: 'Category trends' }))
/** The text of each row in the list beside the chart. */
const rows = (name: string) =>
  within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((li) => li.textContent)
/** The table view's body rows, as text. */
const tableRows = () =>
  explore()
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.textContent)

async function open(url = '/insights') {
  const utils = renderApp(url)
  await screen.findByRole('region', { name: 'Explore' })
  return utils
}

describe('Insights page', () => {
  it('opens on the last six months: the headline numbers and where the money went', async () => {
    const { container } = await open()
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('aria-current', 'page')

    expect(summary().getByText('Spent').parentElement!.parentElement).toHaveTextContent('Spent1,390≈ 232 a month')
    expect(summary().getByText('15,000')).toBeInTheDocument()
    expect(summary().getByText('+13,610')).toBeInTheDocument()
    expect(summary().getByText('91%')).toBeInTheDocument()
    // Nothing happened in the six months before, so there is nothing to compare with.
    expect(summary().queryByTitle('Against the previous period')).not.toBeInTheDocument()

    expect(explore().getByRole('heading', { name: 'Spending by category' })).toBeInTheDocument()
    expect(explore().getByText('Oct 2025 – Mar 2026 · EGP · 11 transactions')).toBeInTheDocument()
    expect(explore().getByRole('radio', { name: 'Pie' })).toBeChecked()
    expect(rows('Breakdown')).toEqual(['Groceries1,10079%', 'Dining25018%', 'Uncategorized403%'])
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Total1,390100%')
    expect(screen.getByRole('button', { name: 'Where it goes' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reads the donut slice under the pointer, and drills into a slice', async () => {
    const { container } = await open()
    const centre = container.querySelector('[aria-live="polite"]')!
    const [groceries] = container.querySelectorAll('.recharts-pie-sector')
    fireEvent.mouseEnter(groceries)
    expect(centre).toHaveTextContent('Groceries1,10079%')
    fireEvent.mouseLeave(centre.parentElement!)
    expect(centre).toHaveTextContent('Total1,390100%')

    // Hovering re-rendered the donut, so look the slice up again.
    fireEvent.click(container.querySelector('.recharts-pie-sector path')!)
    await waitFor(() => expect(currentUrl().searchParams.get('category')).toBe('Groceries'))
    expect(currentUrl().searchParams.get('by')).toBe('merchant')
  })

  it('compares a shorter period with the one before it', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('radio', { name: '3M' }))
    expect(currentUrl().searchParams.get('range')).toBe('3m')
    // 1,240 spent against December's 150; no income before, so no change to show for it.
    const spent = summary().getByText('Spent').parentElement!
    expect(within(spent).getByTitle('Against the previous period')).toHaveTextContent('727%')
    expect(within(summary().getByText('Income').parentElement!).queryByTitle(/previous/)).not.toBeInTheDocument()
    expect(explore().getByText('Jan – Mar 2026 · EGP · 10 transactions')).toBeInTheDocument()
  })

  it('switches between shortcuts, lighting the one on screen', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Cash flow' }))
    expect(currentUrl().search).toContain('measure=flow&by=month&split=none&chart=bar')
    expect(screen.getByRole('button', { name: 'Cash flow' })).toHaveAttribute('aria-pressed', 'true')
    expect(explore().getByRole('heading', { name: 'Cash flow by month' })).toBeInTheDocument()
    expect(rows('Series')).toEqual(['Income15,000', 'Spending1,390', 'Net13,610'])
    // Cash flow is already two series, so there is nothing to split it by.
    expect(explore().queryByRole('combobox', { name: 'Split by' })).not.toBeInTheDocument()

    await user.click(explore().getByRole('radio', { name: 'Table' }))
    expect(tableRows()).toEqual([
      'October 2025000',
      'November 2025000',
      'December 20250150-150',
      'January 20265,0003504,650',
      'February 20265,0005004,500',
      'March 20265,0003904,610',
      'Total15,0001,39013,610',
    ])
  })

  it('builds any view from the sentence, offering only the charts that fit', async () => {
    const { user } = await open()
    await user.selectOptions(explore().getByRole('combobox', { name: 'Measure' }), 'net')
    // A pie of net amounts can't be drawn, so the view falls back to bars.
    expect(explore().queryByRole('radio', { name: 'Pie' })).not.toBeInTheDocument()
    expect(explore().getByRole('radio', { name: 'Bar' })).toBeChecked()

    await user.selectOptions(explore().getByRole('combobox', { name: 'Group by' }), 'month')
    expect(explore().getByRole('heading', { name: 'Net by month' })).toBeInTheDocument()
    const stats = explore().getByText('Highest').closest('dl')!
    expect(stats).toHaveTextContent(
      'Total13,610Average per month2,268Highest4,650January 2026Lowest-150December 2025',
    )
  })
})

describe('Insights empty and error states', () => {
  it('says so when there is nothing imported yet', async () => {
    api.insights = []
    renderApp('/insights')
    expect(await screen.findByText('No transactions yet. Run an import from the Dashboard to see insights.')).toBeInTheDocument()
  })

  it('shows the error the API reports', async () => {
    server.use(http.get('*/api/insights', () => HttpResponse.json({ error: 'database is down' }, { status: 500 })))
    renderApp('/insights')
    expect(await screen.findByText('database is down')).toBeInTheDocument()
  })
})
