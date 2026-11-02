import { useMutation, useMutationState, useQueryClient, type MutationState } from '@tanstack/react-query'
import type { ImportResponse } from '@wealthi/shared'
import { runImport } from '../utils/api'

const IMPORT_KEY = ['import']

/**
 * Runs the import and tracks its latest run.
 *
 * The state is read back from the mutation cache rather than from this
 * component's own mutation, so leaving Settings mid-import and coming back
 * still shows it running, then its report. The import rebuilds every
 * transaction and balance, so when it finishes the ledger views refetch.
 */
export function useImport() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationKey: IMPORT_KEY,
    mutationFn: () => runImport(),
    onSuccess: () => {
      for (const key of ['transactions', 'balances', 'spending', 'insights']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })

  const runs = useMutationState({
    filters: { mutationKey: IMPORT_KEY },
    select: (m) => m.state as MutationState<ImportResponse, Error>,
  })
  const latest = runs.at(-1)

  return {
    start: () => mutation.mutate(),
    isPending: latest?.status === 'pending',
    report: latest?.status === 'success' ? latest.data : undefined,
    error: latest?.status === 'error' ? latest.error : null,
  }
}
