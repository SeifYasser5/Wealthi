import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCategories, fetchSpending, updateTransactionCategory } from '../utils/api'

export function useSpending(yearMonth: string) {
  return useQuery({
    queryKey: ['spending', yearMonth],
    queryFn: ({ signal }) => fetchSpending(yearMonth, signal),
    placeholderData: keepPreviousData,
  })
}

/** The assignable category list. Server-side constant, so it is cached for the session. */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => fetchCategories(signal),
    staleTime: Infinity,
  })
}

/**
 * Assigns a category to a transaction. Categorizing a row moves it out of the
 * Uncategorized bucket, so both the spending breakdown and the transaction
 * listing are refetched on success.
 */
export function useUpdateTransactionCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: string | null }) => updateTransactionCategory(id, category),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['spending'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
