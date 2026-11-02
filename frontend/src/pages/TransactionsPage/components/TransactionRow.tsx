import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, PencilLine, Repeat } from 'lucide-react'
import { useAccounts } from '../../../hooks/useAccounts'
import { formatDate, isBalanced, money } from '../../../utils/utils'
import type { Transaction } from '@wealthi/shared'

const CELL = 'whitespace-nowrap px-4 py-3.5'
const DASH = <span className="text-muted">—</span>

/** A row with no SMS and no schedule behind it was entered by hand (CSV entries never reach `transactions`). */
const isManual = (tx: Transaction) => tx.rawText === null && tx.scheduleId === null

/** The round icon in front of a merchant, Revolut style: what kind of movement this row is. */
export function TransactionIcon({ tx, size = 'sm' }: { tx: Transaction; size?: 'sm' | 'lg' }) {
  const Icon = tx.isTransfer ? ArrowLeftRight : tx.type === 'credit' ? ArrowDownLeft : ArrowUpRight
  const tone = tx.isTransfer
    ? 'bg-primary-soft text-primary'
    : tx.type === 'credit'
      ? 'bg-positive-soft text-positive'
      : 'bg-surface-hover text-subtle'
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full ${tone} ${size === 'lg' ? 'size-14' : 'size-9'}`}
    >
      <Icon size={size === 'lg' ? 24 : 16} />
    </span>
  )
}

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
      className="cursor-pointer transition-colors hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
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
      <td className={`${CELL} text-subtle`}>{formatDate(tx.transactedAt)}</td>
      <td className={`${CELL} text-subtle`}>{accountLabel(tx.account)}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <TransactionIcon tx={tx} />
          <span className="font-medium whitespace-nowrap text-foreground">{tx.merchant ?? DASH}</span>
          {tx.isTransfer && tx.counterAccount && (
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-primary">
              ↔ {accountLabel(tx.counterAccount)}
            </span>
          )}
          {tx.scheduleId !== null && (
            <span
              title="Added by a schedule"
              className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-subtle"
            >
              <Repeat size={12} aria-hidden />
              Scheduled
            </span>
          )}
          {isManual(tx) && (
            <span
              title="Entered by hand on the Manual page"
              className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-subtle"
            >
              <PencilLine size={12} aria-hidden />
              Manual
            </span>
          )}
        </div>
      </td>
      <td className={CELL}>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            tx.type === 'credit' ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
          }`}
        >
          {tx.type}
        </span>
      </td>
      <td
        className={`${CELL} text-right font-semibold tabular-nums ${
          tx.type === 'credit' ? 'text-positive' : 'text-negative'
        }`}
      >
        {money(tx.amount)}
      </td>
      <td className={`${CELL} text-right tabular-nums text-subtle`}>
        {tx.reportedBalance != null ? money(tx.reportedBalance) : DASH}
      </td>
      <td className={`${CELL} text-right tabular-nums`}>
        {computed != null ? (
          <span className={matches ? 'text-positive' : 'text-negative'}>{money(computed)}</span>
        ) : (
          DASH
        )}
      </td>
      <td className={`${CELL} text-right tabular-nums`}>
        {discrepancy != null ? (
          <span className={matches ? 'text-positive' : 'font-medium text-warning'}>{money(discrepancy)}</span>
        ) : (
          DASH
        )}
      </td>
    </tr>
  )
}
