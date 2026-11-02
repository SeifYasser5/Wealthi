import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Breakdown } from '../../src/pages/InsightsPage/components/Breakdown'
import { CategoryTrends } from '../../src/pages/InsightsPage/components/CategoryTrends'
import { ChartTooltip, type Datum } from '../../src/pages/InsightsPage/components/ChartTooltip'
import { Delta, SummaryTiles } from '../../src/pages/InsightsPage/components/SummaryTiles'
import {
  DEFAULT_VIEW,
  share,
  type ChartData,
  type ChartPoint,
  type ChartSeries,
  type Summary,
  type View,
} from '../../src/utils/insights'

const view = (over: Partial<View> = {}): View => ({ ...DEFAULT_VIEW, currency: 'EGP', ...over })

const single: ChartSeries = { key: 'value', label: 'Spending', swatch: 'chart-1', total: 0 }
const point = (key: string, total: number, over: Partial<ChartPoint> = {}): ChartPoint => ({
  key,
  label: key,
  title: `${key} title`,
  swatch: 'chart-2',
  values: { value: total },
  total,
  drill: true,
  ...over,
})
const data = (points: ChartPoint[], series: ChartSeries[] = [single], total = 0): ChartData => ({
  points,
  series,
  total,
})

describe('share', () => {
  it('rounds, marks slivers, and survives an empty whole', () => {
    expect(share(1, 3)).toBe('33%')
    expect(share(1, 1000)).toBe('<1%')
    expect(share(0, 10)).toBe('0%')
    expect(share(5, 0)).toBe('0%')
  })
})

describe('ChartTooltip', () => {
  const series: ChartSeries[] = [
    { key: 'received', label: 'Income', swatch: 'positive', total: 0 },
    { key: 'spent', label: 'Spending', swatch: 'negative', total: 0 },
  ]
  const datum = { key: 'k', label: 'Jan', title: 'January 2026', swatch: 'chart-2', drill: false, received: 100, spent: 30 } as Datum // prettier-ignore
  const payload = [{ payload: datum }]

  it('shows nothing while the pointer is elsewhere', () => {
    const { container, rerender } = render(<ChartTooltip measure="spent" series={series} payload={payload} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ChartTooltip active measure="spent" series={series} payload={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ChartTooltip active measure="spent" series={series} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists every series, value first, with the total of a stack', () => {
    render(<ChartTooltip active measure="spent" series={series} payload={payload} />)
    expect(screen.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByText('100').nextSibling).toHaveTextContent('Income')
    expect(screen.getByText('30').nextSibling).toHaveTextContent('Spending')
    expect(screen.getByText('Total').parentElement).toHaveTextContent('Total130')
  })

  it('totals cash flow as its net, and an average not at all', () => {
    const { rerender } = render(<ChartTooltip active measure="flow" series={series} payload={payload} />)
    expect(screen.getByText('Net').parentElement).toHaveTextContent('Net70')
    rerender(<ChartTooltip active measure="average" series={series} payload={payload} />)
    expect(screen.queryByText('Net')).not.toBeInTheDocument()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('reads a donut slice as its share of the whole, keyed by the slice color', () => {
    const slice = { ...datum, value: 25 }
    render(<ChartTooltip active measure="count" series={[single]} payload={[{ payload: slice }]} total={100} />)
    expect(screen.getByText('25%'.replace('%', ''))).toBeInTheDocument()
    expect(screen.getByText('25% of total')).toBeInTheDocument()
  })
})

describe('Delta', () => {
  it('is green when the move is a good one, red when it is not, grey when flat', () => {
    const { rerender } = render(<Delta value={12.4} upIsGood />)
    expect(screen.getByTitle('Against the previous period')).toHaveTextContent('12%')
    expect(screen.getByTitle('Against the previous period')).toHaveClass('text-positive')
    rerender(<Delta value={12.4} upIsGood={false} />)
    expect(screen.getByTitle('Against the previous period')).toHaveClass('text-negative')
    rerender(<Delta value={-30} upIsGood={false} title="vs usual" />)
    expect(screen.getByTitle('vs usual')).toHaveClass('text-positive')
    rerender(<Delta value={-30} upIsGood />)
    expect(screen.getByTitle('Against the previous period')).toHaveClass('text-negative')
    rerender(<Delta value={0.2} upIsGood unit=" pts" />)
    expect(screen.getByTitle('Against the previous period')).toHaveTextContent('flat')
    rerender(<Delta value={9} upIsGood unit=" pts" />)
    expect(screen.getByTitle('Against the previous period')).toHaveTextContent('9 pts')
  })
})

describe('SummaryTiles', () => {
  const summary = (over: Partial<Summary> = {}): Summary => ({
    spent: 100,
    received: 1000,
    net: 900,
    savingsRate: 90,
    monthly: { spent: [50, 50], received: [500, 500], net: [450, 450] },
    ...over,
  })

  it('compares each tile with the previous period, and the rate in points', () => {
    render(<SummaryTiles current={summary()} previous={summary({ spent: 200, savingsRate: 80 })} period="Jan – Feb 2026" months={2} /> ) // prettier-ignore
    expect(screen.getByText('Spent').parentElement).toHaveTextContent('50%')
    expect(screen.getByText('Savings rate').parentElement).toHaveTextContent('10 pts')
    expect(screen.getByText('+900')).toBeInTheDocument()
    expect(screen.getByText('kept')).toBeInTheDocument()
  })

  it('names the period for one month, draws no trend of one point, and copes without income', () => {
    const lone = summary({ savingsRate: null, net: -50, monthly: { spent: [1], received: [0], net: [-50] } })
    const { container } = render(<SummaryTiles current={lone} previous={summary({ savingsRate: null })} period="October 2026" months={1} /> ) // prettier-ignore
    expect(screen.getAllByText('October 2026')).toHaveLength(2)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('more out than in')).toBeInTheDocument()
    expect(screen.getByText('-50')).toBeInTheDocument()
    expect(container.querySelector('.recharts-wrapper')).toBeNull()
  })

  it('has no rate change when the previous period had no income', () => {
    render(<SummaryTiles current={summary()} previous={summary({ savingsRate: null })} period="p" months={2} />)
    expect(screen.getByText('Savings rate').parentElement).not.toHaveTextContent('pts')
  })
})

describe('Breakdown', () => {
  const noop = () => {}

  it('totals each series of a split, with shares where they add up', () => {
    const series: ChartSeries[] = [
      { key: 'a', label: 'Dining', swatch: 'chart-1', total: 75 },
      { key: 'b', label: 'Rent', swatch: 'chart-2', total: 25 },
    ]
    const { rerender } = render(<Breakdown data={data([point('x', 100)], series)} view={view({ split: 'category' })} onDrill={noop} /> ) // prettier-ignore
    expect(within(screen.getByRole('list', { name: 'Series' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Dining7575%', 'Rent2525%']) // prettier-ignore
    rerender(<Breakdown data={data([point('x', 100)], series)} view={view({ measure: 'average', split: 'category' })} onDrill={noop} /> ) // prettier-ignore
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
    rerender(<Breakdown data={data([point('x', 100)], series, 50)} view={view({ measure: 'flow', by: 'month' })} onDrill={noop} /> ) // prettier-ignore
    expect(screen.getByText('Net').parentElement).toHaveTextContent('Net50')
  })

  it('states the total, average, highest and lowest of a timeline', () => {
    const points = [point('a', 10, { title: 'January', drill: false }), point('b', 30, { title: 'February', drill: false })] // prettier-ignore
    const { rerender } = render(<Breakdown data={data(points, [single], 40)} view={view({ by: 'month', chart: 'bar' })} onDrill={noop} /> ) // prettier-ignore
    const stats = screen.getByText('Highest').closest('dl')!
    expect(stats).toHaveTextContent('Total40Average per month20Highest30FebruaryLowest10January')
    rerender(<Breakdown data={data(points, [single], 40)} view={view({ measure: 'average', by: 'week' })} onDrill={noop} /> ) // prettier-ignore
    expect(screen.getByText('Overall')).toBeInTheDocument()
    expect(screen.getByText('Average per week')).toBeInTheDocument()
  })

  it('ranks a breakdown, each row a way into it unless it is Other', async () => {
    const onDrill = vi.fn()
    const points = [point('Rent', 80), point('Gym', 20, { drill: false, title: 'Other' })]
    render(<Breakdown data={data(points)} view={view({ chart: 'pie' })} onDrill={onDrill} />)
    expect(within(screen.getByRole('list', { name: 'Breakdown' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Rent title8080%', 'Other20 20%'.replace(' ', '')]) // prettier-ignore
    await userEvent.click(screen.getByRole('button', { name: 'Explore Rent title' }))
    expect(onDrill).toHaveBeenCalledWith('Rent')
    expect(screen.queryByRole('button', { name: 'Explore Other' })).not.toBeInTheDocument()
  })

  it('draws a negative amount in red, a bar view in one color, and an all-zero list with empty bars', () => {
    const { container, rerender } = render(<Breakdown data={data([point('a', -5), point('b', 10)])} view={view({ measure: 'net', by: 'merchant', chart: 'bar' })} onDrill={noop} /> ) // prettier-ignore
    expect(container.querySelector('.bg-negative')).toBeInTheDocument()
    expect(container.querySelector('.bg-chart-1')).toBeInTheDocument()
    expect(screen.queryByText('%', { exact: false })).not.toBeInTheDocument()
    rerender(<Breakdown data={data([point('a', 0)])} view={view({ chart: 'pie' })} onDrill={noop} />)
    expect(container.querySelector('[style*="width: 0%"]')).toBeInTheDocument()
  })
})

describe('CategoryTrends', () => {
  const ranks = { category: new Map([['Rent', 0], ['Gym', 1]]), merchant: new Map(), account: new Map() } // prettier-ignore
  const trend = (category: string, over = {}) => ({
    category,
    total: 300,
    monthly: [100, 200],
    average: 150,
    latest: 200,
    usual: 100,
    ...over,
  })

  it('says so when nothing was spent', () => {
    render(<CategoryTrends trends={[]} ranks={ranks} budgets={new Map()} months={3} latestLabel="This month" onOpen={vi.fn()} /> ) // prettier-ignore
    expect(screen.getByText('No spending in this period.')).toBeInTheDocument()
  })

  it('opens a category, and measures the latest month against what is usual and against its budget', async () => {
    const onOpen = vi.fn()
    const budgets = new Map([['Rent', 150], ['Gym', 0], ['Spa', 1000]]) // prettier-ignore
    render(
      <CategoryTrends
        trends={[trend('Rent'), trend('Gym', { usual: null }), trend('Spa')]}
        ranks={ranks}
        budgets={budgets}
        months={2}
        latestLabel="October"
        onOpen={onOpen}
      />,
    )
    const rent = screen.getByRole('button', { name: 'Explore Rent' })
    expect(rent).toHaveTextContent('≈ 150 a month')
    expect(rent).toHaveTextContent('October 200')
    expect(within(rent).getByTitle('Against the usual spending by this day of the month')).toHaveTextContent('100%')
    expect(rent).toHaveTextContent('50 over of 150 budget')
    expect(within(rent).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')

    // No earlier month to compare with, and a zero budget is used up at once.
    const gym = screen.getByRole('button', { name: 'Explore Gym' })
    expect(within(gym).queryByTitle(/usual/)).not.toBeInTheDocument()
    expect(within(gym).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')

    const spa = screen.getByRole('button', { name: 'Explore Spa' })
    expect(spa).toHaveTextContent('800 left of 1,000 budget')
    expect(within(spa).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')

    await userEvent.click(rent)
    expect(onOpen).toHaveBeenCalledWith('Rent')
  })

  it('has no trend to draw for a single month', () => {
    const { container } = render(<CategoryTrends trends={[trend('Rent', { usual: null })]} ranks={ranks} budgets={new Map()} months={1} latestLabel="This month" onOpen={vi.fn()} /> ) // prettier-ignore
    expect(screen.getByText('this month')).toBeInTheDocument()
    expect(container.querySelector('.recharts-wrapper')).toBeNull()
  })
})
