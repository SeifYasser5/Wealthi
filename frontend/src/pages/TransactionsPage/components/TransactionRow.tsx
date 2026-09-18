import { useAccounts } from '../../../hooks/useAccounts'
import { formatDate, money } from '../../../utils/utils'
import type { Transaction } from '@wealthi/shared'

/**
 * One transaction. `computed` is the running balance the table derived for
 * this row, or null when there is nothing to derive it from.
 */
export function TransactionRow({ tx, computed }: { tx: Transaction; computed: number | null | undefined }) {
  const { label: accountLabel } = useAccounts()
  const discrepancy = computed != null && tx.reportedBalance != null ? tx.reportedBalance - computed : null
  const matches = discrepancy != null && Math.abs(discrepancy) < 0.005

  return (
    <tr className="transition hover:bg-[#e9eaed]">
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
          <span className={matches ? 'text-[#00d54b]' : 'font-medium text-[#ff9500]'}>{money(discrepancy)}</span>
        ) : (
          <span className="text-[#9a9ba8]">—</span>
        )}
      </td>
    </tr>
  )
}
