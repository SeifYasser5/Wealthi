import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { ImportResponse } from '@wealthi/shared'
import { formatDate, plural } from '../../../utils/utils'

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-raised p-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{children}</dd>
    </div>
  )
}

/** The headline for a report, and whether it needs your attention. */
function summarize(report: ImportResponse): { ok: boolean; title: string; detail: string } {
  if (report.status === 'skipped') {
    return {
      ok: false,
      title: 'Import skipped',
      detail: `No chat.db found at ${report.source}. Copy your iMessage DB there or set IMESSAGE_DB_PATH.`,
    }
  }
  if (report.totalStored === 0) {
    return {
      ok: false,
      title: 'Nothing imported',
      detail: 'chat.db held no bank transactions, so the stored ledger was kept as it was.',
    }
  }
  const rebuilt = `Rebuilt ${plural(report.months, 'month')} of balances from ${plural(report.totalStored, 'transaction')}.`
  // Parse errors are expected — not every bank SMS is a transaction — so they
  // never turn a completed import into a warning; they are listed for review.
  const unparsed = report.parseErrors.length
  const detail = unparsed > 0 ? `${rebuilt} ${plural(unparsed, 'message')} not parsed, listed below.` : rebuilt
  return { ok: true, title: 'Import complete', detail }
}

export function ImportReport({ report }: { report: ImportResponse }) {
  const { ok, title, detail } = summarize(report)
  const Icon = ok ? CircleCheck : TriangleAlert

  return (
    <section aria-label="Import report" className="rounded-3xl bg-surface p-6">
      <div className="flex items-start gap-4">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${ok ? 'bg-positive-soft' : 'bg-warning-soft'}`}
        >
          <Icon size={20} aria-hidden className={ok ? 'text-positive' : 'text-warning'} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-subtle">{detail}</p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Months">{report.months}</Stat>
        <Stat label="Transactions stored">{report.totalStored}</Stat>
        <Stat label="Parse errors">{report.parseErrors.length}</Stat>
        <Stat label="Took">{(report.durationMs / 1000).toFixed(1)} s</Stat>
      </dl>

      <p className="mt-5 break-all text-xs text-muted">
        {report.source} · finished {formatDate(report.finishedAt)}{' '}
        {new Date(report.finishedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </p>

      {report.parseErrors.length > 0 && (
        <div className="mt-5 border-t border-line pt-5">
          <h3 className="text-sm font-medium text-subtle">Messages that could not be parsed</h3>
          <ul className="mt-3 max-h-128 space-y-3 overflow-y-auto">
            {report.parseErrors.map((e, i) => (
              <li key={i} className="rounded-2xl bg-surface-raised p-4">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{e.sender}</span>
                  <span className="text-subtle">{formatDate(e.messageDate)}</span>
                </div>
                <p className="mt-1 text-sm text-subtle">{e.reason}</p>
                <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-foreground">{e.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
