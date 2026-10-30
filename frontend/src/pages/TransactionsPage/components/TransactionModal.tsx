import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useAccounts } from '../../../hooks/useAccounts'
import { formatDate, money } from '../../../utils/utils'
import type { Transaction } from '@wealthi/shared'

/** One label/value pair in the detail grid. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
      data-testid="modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-background p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{tx.merchant ?? 'No merchant'}</h2>
            <p className="mt-0.5 text-sm text-subtle">{formatDate(tx.transactedAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            autoFocus
            className="rounded-lg p-1 text-subtle transition hover:bg-surface-hover hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <Field label="Amount">
            <span className={`font-medium tabular-nums ${tx.type === 'credit' ? 'text-positive' : 'text-negative'}`}>
              {money(tx.amount)} {tx.currency}
            </span>
          </Field>
          <Field label="Type">{tx.type}</Field>
          <Field label="Account">{accountLabel(tx.account)}</Field>
          <Field label="Category">{tx.category ?? DASH}</Field>
          <Field label="Reported balance">
            <span className="tabular-nums">{tx.reportedBalance != null ? money(tx.reportedBalance) : DASH}</span>
          </Field>
          <Field label="Transfer to">{tx.counterAccount ? accountLabel(tx.counterAccount) : DASH}</Field>
          <Field label="Month">{tx.yearMonth}</Field>
          <Field label="Imported">{formatDate(tx.createdAt)}</Field>
        </dl>

        <div className="mt-5 border-t border-line pt-5">
          <h3 className="text-xs uppercase tracking-wide text-muted">Bank message</h3>
          {tx.rawText ? (
            <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-surface p-3 text-sm text-foreground">
              {tx.rawText}
            </p>
          ) : (
            // Manual and CSV entries have no SMS behind them.
            <p className="mt-2 text-sm text-muted">No message stored for this transaction.</p>
          )}
        </div>

        <p className="mt-4 select-all font-mono text-xs text-muted">{tx.id}</p>
      </div>
    </div>
  )
}
