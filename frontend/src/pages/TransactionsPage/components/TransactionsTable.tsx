import {
  amountColor,
  buildComputedBalances,
  CURRENCIES,
  discrepancyByCurrency,
  isBalanced,
  money,
  netByCurrency,
  plural,
} from '../../../utils/utils'
import { useState } from 'react'
import { TransactionRow } from './TransactionRow'
import { TransactionModal } from './TransactionModal'
import type { Transaction } from '@wealthi/shared'

interface Props {
  transactions: Transaction[]
}

export function TransactionsTable({ transactions }: Props) {
  // The clicked row's id, not the row itself, so the modal follows a refetch
  // instead of showing a stale copy.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = transactions.find((tx) => tx.id === selectedId) ?? null
  const computedBalances = buildComputedBalances(transactions)
  const nets = CURRENCIES.map((currency) => netByCurrency(transactions, currency))
  const discrepancies = CURRENCIES.map((currency) => discrepancyByCurrency(transactions, computedBalances, currency))

  return (
    <>
      {selected && <TransactionModal tx={selected} onClose={() => setSelectedId(null)} />}
      {/* Scrolls on its own, inside whatever height the page leaves it, so the header row stays put. */}
      <div className="min-h-0 overflow-auto rounded-3xl bg-surface">
        <table className="w-full min-w-4xl border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-left text-xs font-medium text-muted">
            <tr>
              <th className="px-4 pt-5 pb-3 font-medium">Date</th>
              <th className="px-4 pt-5 pb-3 font-medium">Account</th>
              <th className="px-4 pt-5 pb-3 font-medium">Merchant</th>
              <th className="px-4 pt-5 pb-3 font-medium">Type</th>
              <th className="px-4 pt-5 pb-3 text-right font-medium">Amount</th>
              <th className="px-4 pt-5 pb-3 text-right font-medium">Reported balance</th>
              <th className="px-4 pt-5 pb-3 text-right font-medium">Computed balance</th>
              <th className="px-4 pt-5 pb-3 text-right font-medium">Discrepancy</th>
            </tr>
          </thead>
          {transactions.length > 0 && (
            <tbody className="border-y border-line bg-surface-raised">
              <tr className="font-semibold">
                <td className="whitespace-nowrap px-4 py-3 text-foreground">Total</td>
                <td className="whitespace-nowrap px-4 py-3 text-subtle">
                  {plural(transactions.length, 'transaction')}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {nets.map(
                    (net, i) =>
                      net !== null && (
                        <div key={i} className={amountColor(net)}>
                          {money(net)}
                        </div>
                      ),
                  )}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {discrepancies.map(
                    (discrepancy, i) =>
                      discrepancy !== null && (
                        <div key={i} className={isBalanced(discrepancy) ? 'text-positive' : 'text-warning'}>
                          {money(discrepancy)}
                        </div>
                      ),
                  )}
                </td>
              </tr>
            </tbody>
          )}
          <tbody className="divide-y divide-line">
            {transactions.map((tx, i) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                computed={computedBalances[i]}
                onSelect={() => setSelectedId(tx.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
