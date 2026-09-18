import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchTransactions } from '../utils/api'
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
  const type = filters.type || undefined
  const transfer = filters.transfer || undefined
  const counterAccount = filters.counterAccount || undefined

  return useQuery({
    queryKey: [
      'transactions',
      filters.yearMonth,
      account ?? '',
      merchant ?? '',
      type ?? '',
      transfer ?? '',
      counterAccount ?? '',
    ],
    queryFn: ({ signal }) =>
      fetchTransactions({ yearMonth: filters.yearMonth, account, merchant, type, transfer, counterAccount }, signal),
    placeholderData: keepPreviousData,
  })
}
