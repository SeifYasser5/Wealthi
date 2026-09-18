import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAccounts } from '../utils/api'
import type { Account, AccountId } from '@wealthi/shared'

/**
 * The configured account list plus lookups over it. Server-side constant, so it
 * is cached for the session. Until it loads, `accounts` is empty, labels fall
 * back to the raw id and `isLoaded` is false.
 */
export function useAccounts() {
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: ({ signal }) => fetchAccounts(signal),
    staleTime: Infinity,
  })

  return useMemo(() => {
    const accounts: Account[] = data?.accounts ?? []
    const byId = new Map(accounts.map((a) => [a.id, a]))
    return {
      accounts,
      isLoaded: data !== undefined,
      label: (id: AccountId) => byId.get(id)?.label ?? id,
      currency: (id: AccountId) => byId.get(id)?.currency ?? 'EGP',
      isAccountId: (id: string) => byId.has(id),
    }
  }, [data])
}
