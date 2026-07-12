import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchSpending } from '../lib/api'

export function useSpending(yearMonth: string) {
  return useQuery({
    queryKey: ['spending', yearMonth],
    queryFn: ({ signal }) => fetchSpending(yearMonth, signal),
    placeholderData: keepPreviousData,
  })
}
