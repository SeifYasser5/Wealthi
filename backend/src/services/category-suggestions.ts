import type { CategorySuggestion, CategorySuggestionsResponse } from '../utils/types'
import { minorToNumber } from '../utils/money'
import { listMerchantDebits, loadMerchantCategories, type MerchantDebit } from '../db/categories'

/** Fewest debits a merchant needs to be suggested, and an amount needs to stand alone. */
export const MIN_REPEATS = 5
/** How many merchants are suggested. */
export const MAX_SUGGESTIONS = 10

/**
 * The merchants worth a category of their own: those with at least MIN_REPEATS
 * debits, not in `mapped`, busiest first, capped at MAX_SUGGESTIONS. Within a
 * merchant, an amount charged MIN_REPEATS times or more is listed on its own;
 * every debit with a rarer amount is counted in `others`.
 */
export function suggestCategories(debits: MerchantDebit[], mapped: ReadonlySet<string>): CategorySuggestion[] {
  const byMerchant = new Map<string, MerchantDebit[]>()
  for (const debit of debits) {
    if (mapped.has(debit.merchant)) continue
    byMerchant.set(debit.merchant, [...(byMerchant.get(debit.merchant) ?? []), debit])
  }

  return [...byMerchant.entries()]
    .filter(([, rows]) => rows.length >= MIN_REPEATS)
    .map(([merchant, rows]): CategorySuggestion => {
      const byAmount = new Map<
        string,
        { amount: MerchantDebit['amount']; currency: MerchantDebit['currency']; count: number }
      >()
      for (const { amount, currency } of rows) {
        const key = `${currency}:${amount}`
        const entry = byAmount.get(key) ?? { amount, currency, count: 0 }
        entry.count++
        byAmount.set(key, entry)
      }
      const repeated = [...byAmount.values()]
        .filter((a) => a.count >= MIN_REPEATS)
        .sort((a, b) => b.count - a.count || a.amount - b.amount)
      const standalone = repeated.reduce((n, a) => n + a.count, 0)
      return {
        merchant,
        count: rows.length,
        amounts: repeated.map((a) => ({ amount: minorToNumber(a.amount), currency: a.currency, count: a.count })),
        others: rows.length - standalone,
      }
    })
    .sort((a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant))
    .slice(0, MAX_SUGGESTIONS)
}

/** The suggestions over the stored ledger. */
export async function categorySuggestions(): Promise<CategorySuggestionsResponse> {
  const [debits, mapped] = await Promise.all([listMerchantDebits(), loadMerchantCategories()])
  return { suggestions: suggestCategories(debits, new Set(mapped.keys())), minRepeats: MIN_REPEATS }
}
