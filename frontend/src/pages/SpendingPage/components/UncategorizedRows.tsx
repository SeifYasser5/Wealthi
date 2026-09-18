import type { UncategorizedTransactionRow } from '@wealthi/shared'
import { formatDay, money } from '../../../utils/utils'
import { CategorySelect } from './CategorySelect'

export function UncategorizedRows({ transactions }: { transactions: UncategorizedTransactionRow[] }) {
  if (transactions.length === 0) {
    return <p className="py-2 text-sm text-muted">Nothing left to categorize in this bucket.</p>
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
            <td className="rounded-l-lg border-b border-line px-2 py-1.5 text-subtle transition-colors group-last:border-0 group-hover:bg-surface-hover">
              {tx.merchant ?? <span className="italic text-muted">no merchant</span>}
              <span className="ml-2 text-xs text-muted">
                {formatDay(tx.transactedAt)} · {tx.account}
              </span>
            </td>
            <td className="border-b border-line py-1.5 pr-3 text-right font-mono text-foreground transition-colors group-last:border-0 group-hover:bg-surface-hover">
              {money(tx.amount)}
            </td>
            <td className="w-px rounded-r-lg border-b border-line py-1.5 pr-2 transition-colors group-last:border-0 group-hover:bg-surface-hover">
              <CategorySelect transactionId={tx.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
