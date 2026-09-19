import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { currentUrl, renderApp } from '../render'

describe('App routing', () => {
  it('redirects an unknown path to /transactions', async () => {
    renderApp('/nowhere')
    expect(await screen.findByRole('heading', { name: 'Transactions', level: 1 })).toBeInTheDocument()
    expect(currentUrl().pathname).toBe('/transactions')
  })

  it('switches pages from the nav bar, keeping the query string', async () => {
    const { user } = renderApp('/transactions?yearMonth=2026-01&account=checking')
    const nav = screen.getByRole('navigation')
    await user.click(within(nav).getByRole('link', { name: 'Balances' }))
    expect(await screen.findByRole('heading', { name: 'Balances', level: 1 })).toBeInTheDocument()
    expect(currentUrl().pathname).toBe('/balances')
    expect(currentUrl().search).toBe('?yearMonth=2026-01&account=checking')

    await user.click(within(nav).getByRole('link', { name: 'Spending' }))
    expect(await screen.findByRole('heading', { name: 'Spending', level: 1 })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Spending' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Transactions' })).not.toHaveAttribute('aria-current')
  })
})
