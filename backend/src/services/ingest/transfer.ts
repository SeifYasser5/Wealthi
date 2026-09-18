import type { ParsedTransaction, TransferRule } from '../../utils/types'
import { config } from '../../utils/config'

/** Loaded from config/wealthi.json — the merchant strings carry real names. */
export const TRANSFER_RULES: TransferRule[] = config.transferRules

/**
 * Tags a parsed leg with its `counterAccount` when a transfer rule matches,
 * turning an ordinary debit/credit into a recognised internal transfer.
 *
 * The leg's `type` is left untouched — direction is read from it (debit = out,
 * credit = in). A leg that already carries a counterAccount (e.g. a manual
 * entry) is returned unchanged.
 */
export function classifyTransfer(tx: ParsedTransaction): ParsedTransaction {
  if (tx.counterAccount !== null) return tx

  const rule = TRANSFER_RULES.find(
    (r) => r.account === tx.account && r.type === tx.type && (r.merchant ? r.merchant === tx.merchant : true),
  )
  if (!rule) return tx
  return { ...tx, counterAccount: rule.counterAccount }
}
