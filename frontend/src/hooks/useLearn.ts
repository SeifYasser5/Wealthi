import { useMutation, useMutationState, useQueryClient, type MutationState } from '@tanstack/react-query'
import type { LearnResponse } from '@wealthi/shared'
import { learnPatterns } from '../utils/api'

const LEARN_KEY = ['learn']

/**
 * Runs a learn and tracks its latest run, read back from the mutation cache
 * like useImport's, so leaving the Learn page mid-run and coming back still
 * shows it running, then its report. New patterns are stored pending, so the
 * pattern list refetches when it finishes — awaited, so the report and the
 * patterns to review appear together.
 */
export function useLearn() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationKey: LEARN_KEY,
    mutationFn: () => learnPatterns(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patterns'] }),
  })

  const runs = useMutationState({
    filters: { mutationKey: LEARN_KEY },
    select: (m) => m.state as MutationState<LearnResponse, Error>,
  })
  const latest = runs.at(-1)

  return {
    start: () => mutation.mutate(),
    isPending: latest?.status === 'pending',
    report: latest?.status === 'success' ? latest.data : undefined,
    error: latest?.status === 'error' ? latest.error : null,
  }
}
