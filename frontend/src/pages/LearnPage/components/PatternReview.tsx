import { useState } from 'react'
import { Check } from 'lucide-react'
import type { PatternRow } from '@wealthi/shared'
import { ActionButton } from '../../../components/ActionButton'
import { useUpdatePatterns } from '../../../hooks/usePatterns'
import { plural } from '../../../utils/utils'
import { PatternCard } from './PatternCard'

/**
 * The approval step of a learn run: every pending pattern as a selectable
 * card, none selected to start with. Confirming enables the selected ones and saves the rest disabled, so they
 * are not offered as new again and can still be enabled from the Disabled tab.
 */
export function PatternReview({ patterns }: { patterns: PatternRow[] }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const update = useUpdatePatterns()

  const enable = patterns.filter((p) => selected.has(p.id)).map((p) => p.id)
  const disable = patterns.filter((p) => !selected.has(p.id)).map((p) => p.id)
  const allSelected = disable.length === 0

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <section aria-label="Review new patterns" className="flex min-h-0 flex-col rounded-3xl bg-surface p-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Review new patterns</h2>
          <p className="mt-0.5 text-sm text-subtle">
            Select the patterns to enable. The rest are saved as disabled, and you can enable them later from the
            Disabled tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelected(allSelected ? new Set() : new Set(patterns.map((p) => p.id)))}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
        >
          {allSelected ? 'Clear' : 'Select all'}
        </button>
      </div>

      <ul className="mt-5 min-h-0 space-y-3 overflow-y-auto">
        {patterns.map((p) => (
          <li key={p.id}>
            <PatternCard pattern={p} on={selected.has(p.id)} onToggle={() => toggle(p.id)} />
          </li>
        ))}
      </ul>

      <div className="mt-5 flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <p className="text-sm text-subtle">
          {allSelected
            ? 'All selected'
            : `${enable.length} of ${patterns.length} selected · ${plural(disable.length, 'pattern')} will be saved disabled`}
        </p>
        <ActionButton onClick={() => update.mutate({ enable, disable })} icon={Check} busy={update.isPending}>
          {update.isPending
            ? 'Saving…'
            : enable.length > 0
              ? `Enable ${plural(enable.length, 'pattern')}`
              : 'Disable all'}
        </ActionButton>
      </div>
      {update.error && (
        <p role="alert" className="mt-4 rounded-2xl bg-negative-soft p-4 text-sm text-negative">
          {update.error.message}
        </p>
      )}
    </section>
  )
}
