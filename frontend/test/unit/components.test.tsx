import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryState } from '../../src/components/QueryState'
import { UpdatingIndicator } from '../../src/components/UpdatingIndicator'
import { FilterBar } from '../../src/pages/TransactionsPage/components/FilterBar'
import { SpendingBar } from '../../src/pages/SpendingPage/components/SpendingBar'
import { CategoryCard } from '../../src/pages/SpendingPage/components/CategoryCard'
import { renderWithProviders } from '../render'

const query = <T,>(over: Partial<{ isLoading: boolean; isError: boolean; error: unknown; data: T }>) => ({
  isLoading: false,
  isError: false,
  error: null,
  data: undefined as T | undefined,
  ...over,
})

describe('QueryState', () => {
  const renderState = (q: ReturnType<typeof query<string[]>>) =>
    render(
      <QueryState query={q} isEmpty={(d) => d.length === 0} errorMessage="fallback" emptyMessage="nothing">
        {(d) => <p>{d.join(',')}</p>}
      </QueryState>,
    )

  it('walks loading → error → empty → content', () => {
    renderState(query({ isLoading: true }))
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows the error message, or the fallback for a non-Error', () => {
    const { unmount } = renderState(query({ isError: true, error: new Error('bad') }))
    expect(screen.getByText('bad')).toBeInTheDocument()
    unmount()
    renderState(query({ isError: true, error: 'string' }))
    expect(screen.getByText('fallback')).toBeInTheDocument()
  })

  it('shows the empty message for no data or empty data, else the content', () => {
    const { unmount } = renderState(query({}))
    expect(screen.getByText('nothing')).toBeInTheDocument()
    unmount()
    const second = renderState(query({ data: [] }))
    expect(screen.getByText('nothing')).toBeInTheDocument()
    second.unmount()
    renderState(query({ data: ['a', 'b'] }))
    expect(screen.getByText('a,b')).toBeInTheDocument()
  })

  it('treats data as non-empty without an isEmpty check', () => {
    render(
      <QueryState query={query({ data: [] as string[] })} errorMessage="" emptyMessage="nothing">
        {() => <p>content</p>}
      </QueryState>,
    )
    expect(screen.getByText('content')).toBeInTheDocument()
  })
})

describe('UpdatingIndicator', () => {
  it('shows only while refetching over existing data', () => {
    const { rerender } = render(<UpdatingIndicator query={{ isFetching: true, isLoading: false }} className="x" />)
    expect(screen.getByText('Updating…')).toHaveClass('text-primary', 'x')
    rerender(<UpdatingIndicator query={{ isFetching: true, isLoading: true }} />)
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument()
    rerender(<UpdatingIndicator query={{ isFetching: false, isLoading: false }} />)
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument()
  })
})

describe('SpendingBar', () => {
  it('draws the share as a bar width', () => {
    const { container } = render(
      <SpendingBar label="L" badge="b" amount={1234} pct={12.345} accent="muted" footer="f" />,
    )
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(container.querySelector('[style]')).toHaveStyle({ width: '12.3%' })
    expect(screen.getByText('L')).toHaveClass('text-muted')
  })
})

describe('CategoryCard', () => {
  it('shows 0% rather than dividing by a zero total', () => {
    render(<CategoryCard row={{ category: 'Rent', total: 0, merchants: [] }} grandTotal={0} uncategorized={[]} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
    expect(screen.getByText('0 merchants')).toBeInTheDocument()
  })
})

describe('FilterBar', () => {
  const noop = () => {}
  const props = {
    account: '',
    type: '',
    transfer: '',
    counterAccount: '',
    onAccountChange: noop,
    onTypeChange: noop,
    onTransferChange: noop,
    onCounterAccountChange: noop,
  } as const

  it('resyncs the search box when the merchant filter changes from outside', () => {
    const onMerchantChange = vi.fn()
    const { rerender } = renderWithProviders(
      <FilterBar {...props} merchant="acme" onMerchantChange={onMerchantChange} />,
    )
    expect(screen.getByPlaceholderText('Search merchant…')).toHaveValue('acme')
    rerender(<FilterBar {...props} merchant="cafe" onMerchantChange={onMerchantChange} />)
    expect(screen.getByPlaceholderText('Search merchant…')).toHaveValue('cafe')
    expect(onMerchantChange).not.toHaveBeenCalled()
  })

  it('lists accounts once they load', async () => {
    renderWithProviders(<FilterBar {...props} merchant="" onMerchantChange={noop} />)
    expect(await screen.findByRole('option', { name: '↔ Savings (USD)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Credit Card' })).toBeInTheDocument()
  })
})
