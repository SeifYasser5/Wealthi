import type { ParsedTransaction, StoredTransferRule } from '../../utils/types'

/**
 * Tags a parsed leg with its `counterAccount` when a transfer rule matches,
 * turning an ordinary debit/credit into a recognised internal transfer.
 *
 * `rules` come from the transfer_rules table (loadTransferRules), a rule with a
 * merchant ahead of the catch-alls. The leg's `type` is left untouched —
 * direction is read from it (debit = out, credit = in). A leg that already
 * carries a counterAccount (e.g. a manual entry) is returned unchanged.
 */
export function classifyTransfer(tx: ParsedTransaction, rules: StoredTransferRule[]): ParsedTransaction {
  if (tx.counterAccount !== null) return tx

  const rule = rules.find(
    (r) => r.account === tx.account && r.type === tx.type && (r.merchant ? r.merchant === tx.merchant : true),
  )
  if (!rule) return tx
  return { ...tx, counterAccount: rule.counterAccount }
}
