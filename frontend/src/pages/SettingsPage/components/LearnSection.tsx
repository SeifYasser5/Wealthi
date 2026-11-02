import { ScanSearch } from 'lucide-react'
import { ActionButton } from '../../../components/ActionButton'
import { QueryState } from '../../../components/QueryState'
import { useLearn } from '../../../hooks/useLearn'
import { usePatterns } from '../../../hooks/usePatterns'
import { LearnReport } from './LearnReport'
import { PatternReview } from './PatternReview'
import { PatternTabs } from './PatternTabs'

/** Learns patterns from chat.db, then reviews the new ones and lists the stored ones. */
export function LearnSection() {
  const { start, isPending, report, error } = useLearn()
  const patterns = usePatterns()
  const pending = patterns.data?.patterns.filter((p) => p.status === 'pending') ?? []
  const panel = 'shrink-0 rounded-3xl py-16 text-center text-sm'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-3xl bg-surface p-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Learn patterns</h2>
          <p className="mt-0.5 text-sm text-subtle">
            Finds the templates your bank messages in chat.db follow. Only patterns not stored yet are offered for
            review.
          </p>
        </div>
        <ActionButton onClick={start} icon={ScanSearch} busy={isPending}>
          {isPending ? 'Learning…' : 'Learn patterns'}
        </ActionButton>
      </section>

      {isPending ? (
        <div role="status" className={`${panel} animate-pulse bg-primary-soft text-primary`}>
          Learning… reading your bank messages.
        </div>
      ) : error ? (
        <div role="alert" className={`${panel} bg-negative-soft text-negative`}>
          {error.message}
        </div>
      ) : (
        report && <LearnReport report={report} pending={pending.length} />
      )}

      <QueryState query={patterns} errorMessage="Could not load patterns." emptyMessage="">
        {(data) => (
          <>
            {pending.length > 0 && <PatternReview patterns={pending} />}
            <PatternTabs patterns={data.patterns} />
          </>
        )}
      </QueryState>
    </div>
  )
}
