import type { ParsedTransaction } from '../utils/types'
import type { AccountId } from '../utils/types'
import { config } from '../utils/config'

/**
 * A deterministic routing rule for an internal transfer.
 *
 * Transfers between own accounts are not guessed by amount/date matching —
 * the bank SMS already tells us the destination through the account the leg
 * lands on plus the merchant string. Each rule maps one such (account, leg
 * direction, merchant) signature to the own account on the other side.
 */
export interface TransferRule {
  /** Human-readable id, for debugging/logging only */
  id: string
  /** Which account's SMS this rule applies to */
  account: AccountId
  /** Which leg this matches — debit = money out, credit = money in */
  type: 'debit' | 'credit'
  /**
   * Anchored merchant match. Omit to match any merchant on this account+type.
   * Kept strict on purpose: a different merchant string is a different rule,
   * not a looser pattern.
   */
  merchant?: string
  /** The own account on the other side of the transfer */
  counterAccount: AccountId
}

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
