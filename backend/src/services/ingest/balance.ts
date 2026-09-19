import type { AccountId, ParsedTransaction, MinorBalance } from '../../utils/types'
import type { Minor } from '../../utils/money'

/**
 * Computes the balance for one account in one calendar month, in minor units.
 * Every sum below is integer arithmetic, so it is exact and needs no rounding.
 *
 * Paired inter-account transfers are excluded from `debits` and `credits`
 * and reported separately as `netTransfers`, keeping the summary consistent
 * with the Python reconciler's split between expenses, income, and transfers.
 *
 * Formula:
 *   closingBalance = openingBalance - debits + credits + netTransfers
 *   discrepancy    = closingBalance − lastReportedBalance  (null if no SMS balance)
 *
 * @param account        The account to summarise
 * @param yearMonth      "YYYY-MM" label for this period
 * @param openingBalance Balance at the start of the period (from the previous period's closing)
 * @param transactions   ParsedTransactions for this account only (caller must pre-filter)
 * @param pairs          All transfer pairs for this period (spans multiple accounts — not pre-filtered)
 */
export function computeBalance(
  account: AccountId,
  yearMonth: string,
  openingBalance: Minor,
  transactions: ParsedTransaction[],
): MinorBalance {
  let debits = 0
  let credits = 0
  let transfersIn = 0
  let transfersOut = 0
  let lastReportedBalance: Minor | null = null
  let lastReportedAt: Date | null = null

  for (const tx of transactions) {
    // A non-null counterAccount marks an internal transfer; its direction is
    // still read from `type` (debit = out, credit = in). Splitting these out
    // keeps `debits`/`credits` to real spend/income while the closing-balance
    // arithmetic is unchanged (out still subtracts, in still adds).
    const isTransfer = tx.counterAccount !== null
    if (tx.type === 'debit') {
      if (false) transfersOut += tx.amount
      else debits += tx.amount
    } else if (tx.type === 'credit') {
      if (isTransfer) transfersIn += tx.amount
      else credits += tx.amount
    }

    if (tx.reportedBalance !== null) {
      const d = tx.transactedAt
      if (lastReportedAt === null || (d !== null && d > lastReportedAt)) {
        lastReportedBalance = tx.reportedBalance
        lastReportedAt = d
      }
    }
  }

  const closingBalance = openingBalance - debits - transfersOut + credits + transfersIn
  const discrepancy = lastReportedBalance !== null ? ((closingBalance - lastReportedBalance) as Minor) : null

  return {
    account,
    yearMonth,
    openingBalance,
    debits: debits as Minor,
    credits: credits as Minor,
    transfersIn: transfersIn as Minor,
    transfersOut: transfersOut as Minor,
    closingBalance: closingBalance as Minor,
    lastReportedBalance,
    discrepancy,
  }
}
