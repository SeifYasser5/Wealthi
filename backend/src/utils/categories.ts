import { config } from './config'

// Maps merchant name (exactly as printed by the bank) to a category label.
// Loaded from config/wealthi.json — edit it there and restart the server; no DB change needed.
export const MERCHANT_CATEGORIES: Record<string, string> = config.merchantCategories

/** Bucket for anything neither manually categorized nor present in the merchant map. */
export const UNCATEGORIZED = 'Uncategorized'

/** Label used in the merchant rollup for transactions the parser left without a merchant. */
export const UNKNOWN_MERCHANT = '(unknown)'

// Categories offered by the UI that no merchant maps to yet. The exported list
// below unions these with everything MERCHANT_CATEGORIES already references, so
// adding a merchant mapping can never produce a label the dropdown is missing.
const EXTRA_CATEGORIES = config.extraCategories

/** Every category a transaction may be assigned to, alphabetically ordered. */
export const SPENDING_CATEGORIES: string[] = Array.from(
  new Set<string>([...EXTRA_CATEGORIES, ...Object.values(MERCHANT_CATEGORIES)]),
).sort((a, b) => a.localeCompare(b))

/** True when `value` is an assignable category — the whitelist the PATCH route enforces. */
export function isSpendingCategory(value: string): boolean {
  return SPENDING_CATEGORIES.includes(value)
}

/**
 * The single rule for deciding which category a transaction counts towards.
 * A manually set `category` always wins; otherwise the merchant map decides;
 * otherwise the transaction is uncategorized.
 */
export function resolveCategory(merchant: string | null, category: string | null): string {
  if (category) return category
  if (merchant && MERCHANT_CATEGORIES[merchant]) return MERCHANT_CATEGORIES[merchant]
  return UNCATEGORIZED
}
