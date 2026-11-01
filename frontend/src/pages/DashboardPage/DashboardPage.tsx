import { RefreshCw } from 'lucide-react'
import { ImportReport } from './components/ImportReport'
import { ActionButton } from '../../components/ActionButton'
import { PageTitle } from '../../components/PageHeader'
import { useImport } from '../../hooks/useImport'

export function DashboardPage() {
  const { start, isPending, report, error } = useImport()
  const panel = 'rounded-3xl py-16 text-center text-sm'

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <PageTitle>Dashboard</PageTitle>
      </header>

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
