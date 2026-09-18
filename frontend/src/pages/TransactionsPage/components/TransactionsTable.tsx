import { buildComputedBalances, money, netByCurrency } from '../../../utils/utils'
import { TransactionRow } from './TransactionRow'
import type { Transaction } from '@wealthi/shared'

interface Props {
  transactions: Transaction[]
}

export function TransactionsTable({ transactions }: Props) {
  const nets = (['EGP', 'USD'] as const).map((currency) => netByCurrency(transactions, currency))
  const computedBalances = buildComputedBalances(transactions)

  return (
    <div className="overflow-hidden rounded-2xl bg-[#f4f5f7]">
      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs font-semibold uppercase tracking-wide text-black">
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
          <tbody className="divide-y divide-[#dde0e6] border-b-2 border-[#dde0e6] bg-[#e9eaed]">
            <tr className="font-semibold">
              <td className="whitespace-nowrap px-4 py-3 text-xs uppercase tracking-wide text-black">Total</td>
              <td className="whitespace-nowrap px-4 py-3 text-[#6b6d80]">{transactions.length} transactions</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {nets.map(
                  (net, i) =>
                    net !== null && (
                      <div key={i} className={net >= 0 ? 'text-[#00d54b]' : 'text-[#ff3b30]'}>
                        {money(net)}
                      </div>
                    ),
                )}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
            </tr>
          </tbody>
        )}
        <tbody className="divide-y divide-[#dde0e6]">
          {transactions.map((tx, i) => (
            <TransactionRow key={tx.id} tx={tx} computed={computedBalances[i]} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
