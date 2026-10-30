import { useAccounts } from '../../../hooks/useAccounts'
import { formatDate, isBalanced, money } from '../../../utils/utils'
import type { Transaction } from '@wealthi/shared'

/**
 * One transaction. `computed` is the running balance the table derived for
 * this row, or null when there is nothing to derive it from. `onSelect` opens
 * the detail modal; the row keeps its table semantics and takes Enter/Space
 * rather than posing as a button.
 */
export function TransactionRow({
  tx,
  computed,
  onSelect,
}: {
  tx: Transaction
  computed: number | null | undefined
  onSelect: () => void
}) {
  const { label: accountLabel } = useAccounts()
  const discrepancy = computed != null && tx.reportedBalance != null ? tx.reportedBalance - computed : null
  const matches = discrepancy != null && isBalanced(discrepancy)

  return (
    <tr
      className="cursor-pointer transition hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        // Space would scroll the page instead of opening the row.
        e.preventDefault()
        onSelect()
      }}
      tabIndex={0}
      aria-haspopup="dialog"
    >
      <td className="whitespace-nowrap px-4 py-3 text-subtle">{formatDate(tx.transactedAt)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-foreground">{accountLabel(tx.account)}</td>
      <td className="px-4 py-3 text-foreground">
        {tx.merchant ?? <span className="text-muted">—</span>}
        {tx.isTransfer && tx.counterAccount && (
          <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
            ↔ {accountLabel(tx.counterAccount)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            tx.type === 'credit' ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
          }`}
        >
          {tx.type}
        </span>
      </td>
      <td
        className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${
          tx.type === 'credit' ? 'text-positive' : 'text-negative'
        }`}
      >
        {money(tx.amount)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-subtle">
        {tx.reportedBalance != null ? money(tx.reportedBalance) : <span className="text-muted">—</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
        {computed != null ? (
          <span className={matches ? 'text-positive' : 'text-negative'}>{money(computed)}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
        {discrepancy != null ? (
          <span className={matches ? 'text-positive' : 'font-medium text-warning'}>{money(discrepancy)}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  )
}
