import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CategorySelect } from '../../src/pages/SpendingPage/components/CategorySelect'
import { renderWithProviders } from '../render'

// Only reachable if the API layer ever rejects with something other than an
// Error; apiFetch always throws Errors, so force it here.
vi.mock('../../src/utils/api', async (orig) => ({
  ...(await orig<typeof import('../../src/utils/api')>()),
  updateTransactionCategory: () => Promise.reject('nope'),
}))

describe('CategorySelect', () => {
  it('falls back to a generic message for a non-Error failure', async () => {
    const { user } = renderWithProviders(<CategorySelect transactionId="t1" />)
    const select = screen.getByRole('combobox')
    await waitFor(() => expect(select).toBeEnabled())
    await user.selectOptions(select, 'Rent')
    expect(await screen.findByText('Failed to save')).toBeInTheDocument()
  })
})
