/** Bucket for anything neither manually categorized nor in the merchant map. Not a stored category. */
export const UNCATEGORIZED = 'Uncategorized'

/** Label used in the merchant rollup for transactions the parser left without a merchant. */
export const UNKNOWN_MERCHANT = '(unknown)'

/**
 * The single rule for deciding which category a transaction counts towards.
 * A manually set `category` always wins; otherwise the merchant map
 * (merchant_categories, merchant → category name) decides; otherwise the
 * transaction is uncategorized.
 */
export function resolveCategory(
  merchant: string | null,
  category: string | null,
  merchantCategories: ReadonlyMap<string, string>,
): string {
  if (category) return category
  return (merchant && merchantCategories.get(merchant)) || UNCATEGORIZED
}
