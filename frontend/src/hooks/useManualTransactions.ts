import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ManualTransactionRequest } from '@wealthi/shared'
import {
  createManualTransaction,
  deleteManualTransaction,
  fetchManualTransactions,
  updateManualTransaction,
} from '../utils/api'

const MANUAL_KEY = ['manual-transactions']

/**
 * The manual transactions of one month, newest first. Under MANUAL_KEY, so a
 * write refetches whichever month is on screen; `keepPreviousData` keeps the
 * old rows up while the next month loads.
 */
export function useManualTransactions(yearMonth: string) {
  return useQuery({
    queryKey: [...MANUAL_KEY, yearMonth],
    queryFn: ({ signal }) => fetchManualTransactions(yearMonth, signal),
    placeholderData: keepPreviousData,
  })
}

/** The ledger only changes at the next import, so no transaction or balance view is refetched. */
function refetch(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: MANUAL_KEY })
}

/** Stores a new manual transaction, or replaces the one with `id`. */
export function useSaveManualTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entry }: { id: number | null; entry: ManualTransactionRequest }) =>
      id === null ? createManualTransaction(entry) : updateManualTransaction(id, entry),
    onSuccess: () => refetch(queryClient),
  })
}

export function useDeleteManualTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteManualTransaction(id),
    onSuccess: () => refetch(queryClient),
  })
}
