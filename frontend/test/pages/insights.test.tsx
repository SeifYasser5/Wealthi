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
    expect(stats).toHaveTextContent('Total13,610Average per month2,268Highest4,650January 2026Lowest-150December 2025')
  })
})

describe('Insights filters and drilling', () => {
  it("moves to an account's currency, and back to every account", async () => {
    const { user } = await open()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'savings_usd')
    expect(currentUrl().searchParams.get('account')).toBe('savings_usd')
    expect(currentUrl().searchParams.get('currency')).toBe('USD')
    expect(explore().getByText('Oct 2025 – Mar 2026 · USD · 1 transaction')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Account' }), '')
    expect(currentUrl().searchParams.get('account')).toBeNull()
  })

  it('switches currency, dropping an account that is in the other one', async () => {
    const { user } = await open('/insights?account=card')
    await user.click(screen.getByRole('radio', { name: 'USD' }))
    expect(currentUrl().searchParams.get('currency')).toBe('USD')
    expect(currentUrl().searchParams.get('account')).toBeNull()
  })

  it('keeps an account that is already in the chosen currency', async () => {
    const { user } = await open('/insights?currency=USD&account=checking')
    await user.click(screen.getByRole('radio', { name: 'EGP' }))
    expect(currentUrl().searchParams.get('currency')).toBe('EGP')
    expect(currentUrl().searchParams.get('account')).toBe('checking')
  })

  it('ignores an unknown currency or account in the URL', async () => {
    await open('/insights?currency=EUR&account=nope')
    expect(screen.getByRole('radio', { name: 'EGP' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('')
  })

  it('drills from a bar into the next question, and lifts the filter again', async () => {
    const { user } = await open('/insights?by=category&chart=bar')
    // Ranked bars say it all themselves: no panel beside them.
    expect(screen.queryByRole('list', { name: 'Breakdown' })).not.toBeInTheDocument()
    const [bar] = document.querySelectorAll('.recharts-bar-rectangle')
    fireEvent.click(bar.querySelector('path')!)
    await waitFor(() => expect(currentUrl().searchParams.get('category')).toBe('Groceries'))
    expect(explore().getByRole('heading', { name: 'Spending by merchant' })).toBeInTheDocument()
    expect(explore().getByRole('button', { name: 'Clear category filter' })).toBeInTheDocument()
    expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(1)

    await user.click(explore().getByRole('button', { name: 'Clear category filter' }))
    expect(currentUrl().searchParams.get('category')).toBeNull()
  })

  it('narrows to a merchant from the breakdown, then clears it', async () => {
    const { user } = await open('/insights?by=merchant&chart=pie')
    await user.click(screen.getByRole('button', { name: 'Explore CITY CAFE' }))
    expect(currentUrl().searchParams.get('merchant')).toBe('CITY CAFE')
    expect(currentUrl().searchParams.get('by')).toBe('month')
    expect(explore().getByText('Oct 2025 – Mar 2026 · EGP · 3 transactions')).toBeInTheDocument()
    await user.click(explore().getByRole('button', { name: 'Clear merchant filter' }))
    expect(currentUrl().searchParams.get('merchant')).toBeNull()
  })

  it('opens a category from its trend card, and scrolls the chart into view', async () => {
    const { user } = await open()
    expect(trends().getByRole('button', { name: 'Explore Groceries' })).toHaveTextContent('1,100')
    await user.click(trends().getByRole('button', { name: 'Explore Groceries' }))
    expect(currentUrl().search).toContain('category=Groceries')
    expect(currentUrl().search).toContain('by=month')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(explore().getByRole('heading', { name: 'Spending by month' })).toBeInTheDocument()
  })

  it('splits a chart by anything it is not grouped by', async () => {
    const { user } = await open('/insights?by=month&chart=bar')
    await user.selectOptions(explore().getByRole('combobox', { name: 'Split by' }), 'category')
    expect(explore().getByRole('heading', { name: 'Spending by month, split by category' })).toBeInTheDocument()
    expect(rows('Series')).toEqual(['Groceries1,10079%', 'Dining25018%', 'Uncategorized403%'])
  })

  it('says so when a filter leaves nothing', async () => {
    await open('/insights?merchant=nowhere')
    expect(explore().getByText(/Nothing to show for Oct 2025 – Mar 2026/)).toBeInTheDocument()
    expect(trends().getByText('No spending in this period.')).toBeInTheDocument()
  })

  it('shows the month by name once the newest month is not the current one', async () => {
    vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'))
    await open()
    expect(trends().getByRole('button', { name: 'Explore Groceries' })).toHaveTextContent('March')
  })
})

describe('Insights chart types', () => {
  it('stacks a split of bars, and draws a trend of lines for several series', async () => {
    const { user } = await open('/insights?by=month&split=category&chart=bar')
    expect(document.querySelectorAll('.recharts-bar')).toHaveLength(3)
    await user.click(explore().getByRole('radio', { name: 'Line' }))
    expect(document.querySelectorAll('.recharts-line')).toHaveLength(3)
  })

  it('draws a single series as an area, and net as signed bars', async () => {
    const { user } = await open('/insights?by=month&chart=line')
    expect(explore().getByText('Total')).toBeInTheDocument()
    expect(document.querySelectorAll('.recharts-area').length).toBeGreaterThan(0)
    await user.selectOptions(explore().getByRole('combobox', { name: 'Measure' }), 'net')
    expect(explore().getByRole('radio', { name: 'Line' })).toBeChecked()
    await user.click(explore().getByRole('radio', { name: 'Bar' }))
    expect(document.querySelectorAll('.recharts-bar-rectangle').length).toBe(4)
  })

  it('does nothing when a bar with nowhere to lead is clicked', async () => {
    await open('/insights?by=month&chart=bar')
    const before = currentUrl().search
    fireEvent.click(document.querySelector('.recharts-bar-rectangle path')!)
    expect(currentUrl().search).toBe(before)
  })

  it('ends a long merchant name on the axis with an ellipsis', async () => {
    api.insights = [{ ...api.insights[0], merchant: 'A MERCHANT NAME THAT RUNS ON AND ON', yearMonth: '2026-03', transactedAt: '2026-03-04T12:00:00.000Z' }] // prettier-ignore
    await open('/insights?by=merchant&chart=bar')
    expect(screen.getAllByText('A MERCHANT NAME THA…').length).toBeGreaterThan(0)
  })

  it('draws cash flow by account sideways, and every weekday', async () => {
    const { user } = await open('/insights?measure=flow&by=account&chart=bar')
    expect(document.querySelectorAll('.recharts-bar')).toHaveLength(2)
    await user.selectOptions(explore().getByRole('combobox', { name: 'Group by' }), 'weekday')
    expect(rows('Series')).toHaveLength(3)
  })

  it('tabulates a split with a total column, and drills from a row', async () => {
    const { user } = await open('/insights?by=category&split=account&chart=table')
    expect(explore().getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Category', 'Credit Card', 'Checking', 'Total']) // prettier-ignore
    expect(tableRows()).toEqual(['Groceries1,10001,100', 'Dining2500250', 'Uncategorized04040', 'Total1,350401,390']) // prettier-ignore
    await user.click(explore().getByRole('button', { name: 'Dining' }))
    expect(currentUrl().searchParams.get('category')).toBe('Dining')
  })

  it('tabulates an average without a total column', async () => {
    await open('/insights?measure=average&by=month&split=category&chart=table')
    expect(explore().queryByRole('columnheader', { name: 'Total' })).not.toBeInTheDocument()
    expect(explore().getByText('Overall')).toBeInTheDocument()
  })

  it('lists a period with nothing to drill into as plain text', async () => {
    await open('/insights?by=month&chart=table')
    expect(explore().queryByRole('button', { name: 'January 2026' })).not.toBeInTheDocument()
    expect(explore().getByRole('rowheader', { name: 'January 2026' })).toBeInTheDocument()
  })
})

describe('Insights empty and error states', () => {
  it('says so when there is nothing imported yet', async () => {
    api.insights = []
    renderApp('/insights')
    expect(
      await screen.findByText('No transactions yet. Run an import from Settings to see insights.'),
    ).toBeInTheDocument()
  })

  it('shows the error the API reports', async () => {
    server.use(http.get('*/api/insights', () => HttpResponse.json({ error: 'database is down' }, { status: 500 })))
    renderApp('/insights')
    expect(await screen.findByText('database is down')).toBeInTheDocument()
  })
})
