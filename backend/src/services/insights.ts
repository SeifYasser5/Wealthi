import type { InsightsResponse } from '@wealthi/shared'
import { loadMerchantCategories } from '../db/categories'
import { getInsightTransactions } from '../db/insights'
import type { InsightTransaction } from '../utils/types'
import { resolveCategory, UNCATEGORIZED } from '../utils/categories'
import { minorToNumber } from '../utils/money'

/**
 * Every non-transfer transaction with its category resolved, for the Insights
 * page to group and sum in the browser. The ledger is a few thousand rows, so
 * one payload lets every chart re-slice it without another request.
 */
export async function getInsights(): Promise<InsightsResponse> {
  const [txs, merchantCategories] = await Promise.all([getInsightTransactions(), loadMerchantCategories()])
  return buildInsights(txs, merchantCategories)
}

export function buildInsights(
  txs: InsightTransaction[],
  merchantCategories: ReadonlyMap<string, string>,
): InsightsResponse {
  return {
    rows: txs.map((tx) => ({
      id: tx.id,
      yearMonth: tx.yearMonth,
      transactedAt: tx.transactedAt.toISOString(),
      type: tx.type,
      amount: minorToNumber(tx.amount),
      currency: tx.currency,
      account: tx.account,
      merchant: tx.merchant,
      category: resolveCategory(tx.merchant, tx.category, merchantCategories),
    })),
    uncategorized: UNCATEGORIZED,
  }
}
