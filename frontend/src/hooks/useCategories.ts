import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { CategoriesResponse } from '@wealthi/shared'
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  fetchCategorySuggestions,
  renameCategory,
  reorderCategories,
  setCategoryBudget,
  setMerchantCategory,
} from '../utils/api'

const CATEGORIES_KEY = ['categories']
const SUGGESTIONS_KEY = ['category-suggestions']

/** Every category in order: the Categories page, and every category dropdown. */
export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: ({ signal }) => fetchCategories(signal),
  })
}

/** The merchants that keep repeating, as candidate categories. */
export function useCategorySuggestions() {
  return useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: ({ signal }) => fetchCategorySuggestions(signal),
  })
}

/** The spending breakdown, the insights and the transaction listing show category names, so a rename or a mapping refetches them. */
function refetchLedger(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['spending'] })
  void queryClient.invalidateQueries({ queryKey: ['insights'] })
  void queryClient.invalidateQueries({ queryKey: ['transactions'] })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export function useRenameCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameCategory(id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })
      refetchLedger(queryClient)
    },
  })
}

/** Only an unused category can be deleted, so nothing on the ledger changes with it. */
export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

/** The answer is every category, so it replaces the cached list rather than refetching it. */
export function useReorderCategories() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => reorderCategories(ids),
    onSuccess: (data: CategoriesResponse) => queryClient.setQueryData(CATEGORIES_KEY, data),
  })
}

/** Moves a merchant's uncategorized transactions with it, so the ledger views are refetched too. */
export function useSetMerchantCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ merchant, categoryId }: { merchant: string; categoryId: number | null }) =>
      setMerchantCategory(merchant, categoryId),
    onSuccess: (data: CategoriesResponse) => {
      queryClient.setQueryData(CATEGORIES_KEY, data)
      refetchLedger(queryClient)
    },
  })
}

/** A budget only changes the category list, so that is all that is refetched. */
export function useSetCategoryBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, budget }: { id: number; budget: number | null }) => setCategoryBudget(id, budget),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

/**
 * Files a suggested merchant under a category: an existing one, or (null) a new
 * category named after the merchant. The merchant then has a category, so it
 * leaves the suggestions.
 */
export function useAddSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ merchant, categoryId }: { merchant: string; categoryId: number | null }) =>
      setMerchantCategory(merchant, categoryId ?? (await createCategory(merchant)).category.id),
    onSuccess: (data: CategoriesResponse) => {
      queryClient.setQueryData(CATEGORIES_KEY, data)
      void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY })
      refetchLedger(queryClient)
    },
  })
}
