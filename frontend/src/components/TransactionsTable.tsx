import { useAccounts } from '../hooks/useAccounts'
import { buildComputedBalances, formatDate, money, netByCurrency } from '../utils/utils'
import type { Transaction } from '@wealthi/shared'

interface Props {
  transactions: Transaction[]
}

export function TransactionsTable({ transactions }: Props) {
  const { label: accountLabel } = useAccounts()
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
          {transactions.map((tx, i) => {
            const computed = computedBalances[i]
            const discrepancy = computed != null && tx.reportedBalance != null ? tx.reportedBalance - computed : null
            const matches = discrepancy != null && Math.abs(discrepancy) < 0.005
            return (
              <tr key={tx.id} className="transition hover:bg-[#e9eaed]">
                <td className="whitespace-nowrap px-4 py-3 text-[#6b6d80]">{formatDate(tx.transactedAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-black">{accountLabel(tx.account)}</td>
                <td className="px-4 py-3 text-black">
                  {tx.merchant ?? <span className="text-[#9a9ba8]">—</span>}
                  {tx.isTransfer && tx.counterAccount && (
                    <span className="ml-2 rounded-full bg-[#0666eb]/10 px-2 py-0.5 text-xs font-medium text-[#0666eb]">
                      ↔ {accountLabel(tx.counterAccount)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.type === 'credit' ? 'bg-[#00d54b]/10 text-[#00d54b]' : 'bg-[#ff3b30]/10 text-[#ff3b30]'
                    }`}
                  >
                    {tx.type}
                  </span>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${
                    tx.type === 'credit' ? 'text-[#00d54b]' : 'text-[#ff3b30]'
                  }`}
                >
                  {money(tx.amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#6b6d80]">
                  {tx.reportedBalance != null ? money(tx.reportedBalance) : <span className="text-[#9a9ba8]">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {computed != null ? (
                    <span className={matches ? 'text-[#00d54b]' : 'text-[#ff3b30]'}>{money(computed)}</span>
                  ) : (
                    <span className="text-[#9a9ba8]">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {discrepancy != null ? (
                    <span className={matches ? 'text-[#00d54b]' : 'font-medium text-[#ff9500]'}>
                      {money(discrepancy)}
                    </span>
                  ) : (
                    <span className="text-[#9a9ba8]">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
