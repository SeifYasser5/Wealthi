import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSpending, updateTransactionCategory } from '../utils/api'

export function useSpending(yearMonth: string) {
  return useQuery({
    queryKey: ['spending', yearMonth],
    queryFn: ({ signal }) => fetchSpending(yearMonth, signal),
    placeholderData: keepPreviousData,
  })
}

/**
 * Assigns a category to a transaction. Categorizing a row moves it out of the
 * Uncategorized bucket, so the spending breakdown, the insights and the
 * transaction listing are refetched on success, and the categories for their counts.
 */
export function useUpdateTransactionCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: number | null }) =>
      updateTransactionCategory(id, categoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['spending'] })
      void queryClient.invalidateQueries({ queryKey: ['insights'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
