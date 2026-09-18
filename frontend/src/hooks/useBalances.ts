import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchBalances } from '../utils/api'

/**
 * Fetches the per-account balance snapshots for the given month. Keyed on the
 * month so TanStack Query refetches (and caches per month) as the user
 * navigates. `keepPreviousData` keeps the old rows visible while the next
 * month loads, avoiding a flash of empty table.
 */
export function useBalances(yearMonth: string) {
  return useQuery({
    queryKey: ['balances', yearMonth],
    queryFn: ({ signal }) => fetchBalances(yearMonth, signal),
    placeholderData: keepPreviousData,
  })
}
