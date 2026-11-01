import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpdatePatternsRequest } from '@wealthi/shared'
import { fetchPatterns, updatePatterns } from '../utils/api'

const PATTERNS_KEY = ['patterns']

/** Every learned pattern; the Learn page splits it by status. */
export function usePatterns() {
  return useQuery({
    queryKey: PATTERNS_KEY,
    queryFn: ({ signal }) => fetchPatterns(signal),
  })
}

/**
 * Enables and disables patterns — a confirmed review, or one toggle. The
 * answer is the full pattern list, so it replaces the cached one rather than
 * refetching it. Patterns only matter to the next import, so no ledger view
 * is refetched.
 */
export function useUpdatePatterns() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (update: UpdatePatternsRequest) => updatePatterns(update),
    onSuccess: (data) => queryClient.setQueryData(PATTERNS_KEY, data),
  })
}
