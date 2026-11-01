import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActionButton } from '../../components/ActionButton'
import { PageTitle } from '../../components/PageHeader'
import { QueryState } from '../../components/QueryState'
import { useSchedules } from '../../hooks/useSchedules'
import { ScheduleForm, type ScheduleSeed } from './components/ScheduleForm'
import { ScheduleItem } from './components/ScheduleItem'
import { SuggestedSchedules } from './components/SuggestedSchedules'

export function SchedulesPage() {
  const schedules = useSchedules()
  const [adding, setAdding] = useState(false)
  // The suggestion the form was opened from, if any; `adding` alone is a blank form.
  const [initial, setInitial] = useState<ScheduleSeed>()
  const closeForm = () => {
    setAdding(false)
    setInitial(undefined)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-4 md:flex md:h-[calc(100dvh-4rem-1px)] md:flex-col">
      <header className="mb-6 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Schedules</PageTitle>
          <p className="mt-1 max-w-2xl text-sm text-subtle">
            Transactions that repeat on their own, like rent or a subscription. Each import adds every occurrence from
            the start date through today, so a new or edited schedule shows on the ledger after the next import.
          </p>
        </div>
        {!adding && (
          <ActionButton onClick={() => setAdding(true)} icon={Plus} busy={false}>
            New schedule
          </ActionButton>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        {adding && (
          <section className="rounded-3xl bg-surface p-6">
            <ScheduleForm key={initial?.merchant} schedule={null} initial={initial} onDone={closeForm} />
          </section>
        )}
        <SuggestedSchedules
          onUse={(suggested) => {
            setInitial(suggested)
            setAdding(true)
          }}
        />
        <QueryState
          query={schedules}
          isEmpty={(data) => data.schedules.length === 0}
          errorMessage="Could not load schedules."
          emptyMessage="No schedules yet. Add one for anything that repeats without a bank message."
        >
          {(data) => (
            <ul
              aria-label="Your schedules"
              className="min-h-0 divide-y divide-line overflow-y-auto rounded-3xl bg-surface"
            >
              {data.schedules.map((schedule) => (
                <ScheduleItem key={schedule.id} schedule={schedule} />
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </div>
  )
}
