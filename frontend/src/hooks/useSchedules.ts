import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ScheduleRequest } from '@wealthi/shared'
import { createSchedule, deleteSchedule, fetchScheduleSuggestions, fetchSchedules, updateSchedule } from '../utils/api'

const SCHEDULES_KEY = ['schedules']

/** Every schedule, by start date. */
export function useSchedules() {
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: ({ signal }) => fetchSchedules(signal),
  })
}

/** Merchants charged once a month, as candidate schedules. Under SCHEDULES_KEY, so a schedule write refetches it. */
export function useScheduleSuggestions() {
  return useQuery({
    queryKey: [...SCHEDULES_KEY, 'suggestions'],
    queryFn: ({ signal }) => fetchScheduleSuggestions(signal),
  })
}

/**
 * A category counts the schedules that use it, so a schedule write refetches
 * the categories too. The ledger only changes at the next import, so no
 * transaction or balance view is refetched.
 */
function refetch(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY })
  void queryClient.invalidateQueries({ queryKey: ['categories'] })
}

/** Stores a new schedule, or replaces the one with `id`. */
export function useSaveSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, schedule }: { id: number | null; schedule: ScheduleRequest }) =>
      id === null ? createSchedule(schedule) : updateSchedule(id, schedule),
    onSuccess: () => refetch(queryClient),
  })
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteSchedule(id),
    onSuccess: () => refetch(queryClient),
  })
}
