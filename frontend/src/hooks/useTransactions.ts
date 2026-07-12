import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchTransactions } from '../lib/api'
import type { Filters } from './useFilters'

/**
 * Fetches transactions for the given filters. The query key includes every
 * filter, so TanStack Query automatically refetches (and caches per
 * combination) whenever any of them changes. `keepPreviousData` keeps the old
 * rows on screen while the next page loads, avoiding a flash of empty table.
 */
export function useTransactions(filters: Filters) {
  const account = filters.account || undefined
  const merchant = filters.merchant.trim() || undefined

  return useQuery({
    queryKey: ['transactions', filters.yearMonth, account ?? '', merchant ?? ''],
    queryFn: ({ signal }) => fetchTransactions({ yearMonth: filters.yearMonth, account, merchant }, signal),
    placeholderData: keepPreviousData,
  })
}
