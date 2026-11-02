import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAccounts } from '../utils/api'
import { CURRENCIES } from '../utils/utils'
import type { Account, AccountId } from '@wealthi/shared'

/**
 * The stored account list plus lookups over it. Only the Settings page changes
 * it, and its writes invalidate this query, so it is cached for the session.
 * Until it loads, `accounts` is empty, labels fall back to the raw id and
 * `isLoaded` is false. `query` is the request itself, for a page that shows its state.
 */
export function useAccounts() {
  const query = useQuery({
    queryKey: ['accounts'],
    queryFn: ({ signal }) => fetchAccounts(signal),
    staleTime: Infinity,
  })
  const { data } = query

  const lookups = useMemo(() => {
    const accounts: Account[] = data?.accounts ?? []
    const byId = new Map(accounts.map((a) => [a.id, a]))
    return {
      accounts,
      isLoaded: data !== undefined,
      label: (id: AccountId) => byId.get(id)?.label ?? id,
      currency: (id: AccountId) => byId.get(id)?.currency ?? CURRENCIES[0],
      isAccountId: (id: string) => byId.has(id),
    }
  }, [data])

  return { ...lookups, query }
}
