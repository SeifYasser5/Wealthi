import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAccounts } from '../../../hooks/useAccounts'
import { formatDate, money } from '../../../utils/utils'
import { TransactionIcon } from './TransactionRow'
import type { Transaction } from '@wealthi/shared'

/** One label/value pair in the detail list, iOS settings style: label left, value right. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  )
}

const DASH = <span className="text-muted">—</span>

/**
 * The full record behind one ledger row, including the bank SMS it was parsed
 * from. Closes on Escape, on the backdrop and on the close button.
 */
export function TransactionModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { label: accountLabel } = useAccounts()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // The backdrop closes on click; the panel stops the click from reaching it.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
      onClick={onClose}
      data-testid="modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          autoFocus
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-surface-raised text-subtle transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X size={16} />
        </button>

        {/* Revolut-style hero: the icon, who, when, and the amount large. */}
        <div className="flex flex-col items-center pt-2 text-center">
          <TransactionIcon tx={tx} size="lg" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">{tx.merchant ?? 'No merchant'}</h2>
          <p className="mt-0.5 text-sm text-subtle">{formatDate(tx.transactedAt)}</p>
          <p
            className={`mt-4 text-4xl font-bold tracking-tight tabular-nums ${
              tx.type === 'credit' ? 'text-positive' : 'text-negative'
            }`}
          >
            {money(tx.amount)} {tx.currency}
          </p>
        </div>

        <dl className="mt-6 divide-y divide-line rounded-2xl bg-surface-raised">
          <Field label="Type">
            <span className="inline-block first-letter:uppercase">{tx.type}</span>
          </Field>
          <Field label="Account">{accountLabel(tx.account)}</Field>
          <Field label="Category">{tx.category ?? DASH}</Field>
          <Field label="Reported balance">
            <span className="tabular-nums">{tx.reportedBalance != null ? money(tx.reportedBalance) : DASH}</span>
          </Field>
          <Field label="Transfer to">{tx.counterAccount ? accountLabel(tx.counterAccount) : DASH}</Field>
          <Field label="Added by">
            {tx.scheduleId !== null ? (
              <Link to="/schedules" className="text-primary hover:underline">
                A schedule
              </Link>
            ) : (
              DASH
            )}
          </Field>
          <Field label="Month">{tx.yearMonth}</Field>
          <Field label="Imported">{formatDate(tx.createdAt)}</Field>
        </dl>

        <div className="mt-6">
          <h3 className="px-1 text-xs font-medium text-muted">Bank message</h3>
          {tx.rawText ? (
            // Shown as the message bubble it arrived as.
            <p className="mt-2 max-w-[90%] rounded-3xl rounded-bl-md bg-surface-hover px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {tx.rawText}
            </p>
          ) : (
            // Manual, scheduled and CSV entries have no SMS behind them.
            <p className="mt-2 px-1 text-sm text-muted">No message stored for this transaction.</p>
          )}
        </div>

        <p className="mt-5 px-1 font-mono text-xs select-all text-muted">{tx.id}</p>
      </div>
    </div>
  )
}
