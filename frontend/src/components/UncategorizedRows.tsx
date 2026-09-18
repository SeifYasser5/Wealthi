import type { UncategorizedTransactionRow } from '@wealthi/shared'
import { formatDay, money } from '../utils/utils'
import { CategorySelect } from './CategorySelect'

export function UncategorizedRows({ transactions }: { transactions: UncategorizedTransactionRow[] }) {
  if (transactions.length === 0) {
    return <p className="py-2 text-sm text-[#9a9ba8]">Nothing left to categorize in this bucket.</p>
  }

  return (
    // Pulled out to the card's horizontal padding so the hover highlight spans the
    // full row. Cells carry the highlight and the separator rather than the <tr>,
    // because a row can neither clip its own corners nor paint a border under
    // `border-separate` — which the rounded corners require.
    <table className="-mx-2 w-[calc(100%+1rem)] border-separate border-spacing-0 text-sm">
      <tbody>
        {transactions.map((tx) => (
          <tr key={tx.id} className="group">
            <td className="rounded-l-lg border-b border-[#dde0e6] px-2 py-1.5 text-[#6b6d80] transition-colors group-last:border-0 group-hover:bg-[#e9eaed]">
              {tx.merchant ?? <span className="italic text-[#9a9ba8]">no merchant</span>}
              <span className="ml-2 text-xs text-[#9a9ba8]">
                {formatDay(tx.transactedAt)} · {tx.account}
              </span>
            </td>
            <td className="border-b border-[#dde0e6] py-1.5 pr-3 text-right font-mono text-black transition-colors group-last:border-0 group-hover:bg-[#e9eaed]">
              {money(tx.amount)}
            </td>
            <td className="w-px rounded-r-lg border-b border-[#dde0e6] py-1.5 pr-2 transition-colors group-last:border-0 group-hover:bg-[#e9eaed]">
              <CategorySelect transactionId={tx.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
