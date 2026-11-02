import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { LearnResponse } from '@wealthi/shared'
import { formatDate, plural } from '../../../utils/utils'

/** The headline for a learn run, and whether it needs your attention. */
function summarize(report: LearnResponse, pending: number): { ok: boolean; title: string; detail: string } {
  if (report.status === 'skipped') {
    return {
      ok: false,
      title: 'Learn skipped',
      detail: `No chat.db found at ${report.source}. Copy your iMessage DB there or set IMESSAGE_DB_PATH.`,
    }
  }
  const undecodable =
    report.undecodable > 0
      ? ` ${plural(report.undecodable, 'message')} could not be decoded and ${report.undecodable === 1 ? 'was' : 'were'} left out.`
      : ''
  if (report.added === 0) {
    const waiting =
      pending > 0
        ? ` ${plural(pending, 'pattern')} from an earlier run ${pending === 1 ? 'is' : 'are'} still waiting for review.`
        : ''
    return {
      ok: true,
      title: 'Nothing new found',
      detail: `Every pattern in ${plural(report.messages, 'bank message')} is already stored.${waiting}${undecodable}`,
    }
  }
  return {
    ok: true,
    title: `Found ${plural(report.added, 'new pattern')}`,
    detail: `Learned from ${plural(report.messages, 'bank message')}. Review them below.${undecodable}`,
  }
}

export function LearnReport({ report, pending }: { report: LearnResponse; pending: number }) {
  const { ok, title, detail } = summarize(report, pending)
  const Icon = ok ? CircleCheck : TriangleAlert

  return (
    <section aria-label="Learn report" className="shrink-0 rounded-3xl bg-surface p-6">
      <div className="flex items-start gap-4">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${ok ? 'bg-positive-soft' : 'bg-warning-soft'}`}
        >
          <Icon size={20} aria-hidden className={ok ? 'text-positive' : 'text-warning'} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-subtle">{detail}</p>
          <p className="mt-3 break-all text-xs text-muted">
            {report.source} · finished {formatDate(report.finishedAt)} · took {(report.durationMs / 1000).toFixed(1)} s
          </p>
        </div>
      </div>
    </section>
  )
}
