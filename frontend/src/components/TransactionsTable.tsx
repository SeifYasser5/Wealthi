import { useAccounts } from '../hooks/useAccounts'
import type { Transaction } from '../lib/api'

interface Props {
  transactions: Transaction[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatAmount(tx: Transaction): string {
  return Math.round(tx.amount).toLocaleString()
}

function netByCurrency(txs: Transaction[], currency: 'EGP' | 'USD'): number {
  return txs
    .filter((tx) => tx.currency === currency)
    .reduce((s, tx) => s + (tx.type === 'credit' ? tx.amount : -tx.amount), 0)
}

function buildComputedBalances(transactions: Transaction[]): (number | null)[] {
  const out: (number | null)[] = new Array(transactions.length).fill(null)
  for (let i = transactions.length - 2; i >= 0; i--) {
    const tx = transactions[i]
    const older = transactions[i + 1]
    if (older.account !== tx.account) continue
    const base = older.reportedBalance ?? out[i + 1]
    if (base == null) continue
    out[i] = tx.type === 'credit' ? base + tx.amount : base - tx.amount
  }
  return out
}

export function TransactionsTable({ transactions }: Props) {
  const { label: accountLabel } = useAccounts()
  const hasEgp = transactions.some((tx) => tx.currency === 'EGP')
  const hasUsd = transactions.some((tx) => tx.currency === 'USD')
  const egpNet = hasEgp ? netByCurrency(transactions, 'EGP') : 0
  const usdNet = hasUsd ? netByCurrency(transactions, 'USD') : 0
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
                {hasEgp && (
                  <div className={egpNet >= 0 ? 'text-[#00d54b]' : 'text-[#ff3b30]'}>
                    {Math.round(egpNet).toLocaleString()}
                  </div>
                )}
                {hasUsd && (
                  <div className={usdNet >= 0 ? 'text-[#00d54b]' : 'text-[#ff3b30]'}>
                    {Math.round(usdNet).toLocaleString()}
                  </div>
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
                      tx.type === 'credit'
                        ? 'bg-[#00d54b]/10 text-[#00d54b]'
                        : 'bg-[#ff3b30]/10 text-[#ff3b30]'
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
                  {formatAmount(tx)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[#6b6d80]">
                  {tx.reportedBalance != null ? (
                    Math.round(tx.reportedBalance).toLocaleString()
                  ) : (
                    <span className="text-[#9a9ba8]">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {computed != null ? (
                    <span className={matches ? 'text-[#00d54b]' : 'text-[#ff3b30]'}>
                      {Math.round(computed).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[#9a9ba8]">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {discrepancy != null ? (
                    <span className={matches ? 'text-[#00d54b]' : 'font-medium text-[#ff9500]'}>
                      {Math.round(discrepancy).toLocaleString()}
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
