import { RefreshCw } from 'lucide-react'
import { ActionButton } from '../../../components/ActionButton'
import { useImport } from '../../../hooks/useImport'
import { ImportReport } from './ImportReport'

/** Runs the import and shows its report. */
export function ImportSection() {
  const { start, isPending, report, error } = useImport()
  const panel = 'rounded-3xl py-16 text-center text-sm'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-surface p-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Import from chat.db</h2>
          <p className="mt-0.5 text-sm text-subtle">Rebuilds every transaction and balance from your bank messages.</p>
        </div>
        <ActionButton onClick={start} icon={RefreshCw} busy={isPending}>
          {isPending ? 'Importing…' : 'Run import'}
        </ActionButton>
      </section>

      {isPending ? (
        <div role="status" className={`${panel} animate-pulse bg-primary-soft text-primary`}>
          Importing… the ledger is being rebuilt.
        </div>
      ) : error ? (
        <div role="alert" className={`${panel} bg-negative-soft text-negative`}>
          {error.message}
        </div>
      ) : report ? (
        <ImportReport report={report} />
      ) : (
        <div className={`${panel} bg-surface text-muted`}>No import run yet. Run one to see its report here.</div>
      )}
    </div>
  )
}
