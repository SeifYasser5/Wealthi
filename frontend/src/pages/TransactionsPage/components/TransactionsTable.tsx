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
    <div className="overflow-hidden rounded-2xl bg-surface">
      {selected && <TransactionModal tx={selected} onClose={() => setSelectedId(null)} />}
      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs font-semibold uppercase tracking-wide text-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Merchant</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Reported Balance</th>
            <th className="px-4 py-3 text-right">Computed Balance</th>
            <th className="px-4 py-3 text-right">Discrepancy</th>
          </tr>
        </thead>
        {transactions.length > 0 && (
          <tbody className="divide-y divide-line border-b-2 border-line bg-surface-hover">
            <tr className="font-semibold">
              <td className="whitespace-nowrap px-4 py-3 text-xs uppercase tracking-wide text-foreground">Total</td>
              <td className="whitespace-nowrap px-4 py-3 text-subtle">{plural(transactions.length, 'transaction')}</td>
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
            <TransactionRow key={tx.id} tx={tx} computed={computedBalances[i]} onSelect={() => setSelectedId(tx.id)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
