import { useState } from 'react'
import type { PatternRow } from '@wealthi/shared'
import { useUpdatePatterns } from '../../../hooks/usePatterns'
import { PatternCard } from './PatternCard'

const TABS = [
  { status: 'enabled', label: 'Enabled', empty: 'No enabled patterns. Learn, then review some.' },
  { status: 'disabled', label: 'Disabled', empty: 'No disabled patterns.' },
] as const

type Tab = (typeof TABS)[number]['status']

/** The reviewed patterns in two tabs; clicking one moves it to the other. */
export function PatternTabs({ patterns }: { patterns: PatternRow[] }) {
  const [active, setActive] = useState<Tab>('enabled')
  const update = useUpdatePatterns()
  const tab = TABS.find((t) => t.status === active)!
  const rows = patterns.filter((p) => p.status === active)

  return (
    <section aria-label="Stored patterns" className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4 px-1 shrink-0">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Your patterns</h2>
          <p className="mt-0.5 text-sm text-subtle">
            Coloured words are read from each message; dashed ones must be there but are ignored. Changes apply at the
            next import.
          </p>
        </div>
        {/* A segmented control, with tab semantics. */}
        <div role="tablist" aria-label="Pattern status" className="flex rounded-full bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              role="tab"
              id={`tab-${t.status}`}
              aria-selected={t.status === active}
              aria-controls="pattern-panel"
              onClick={() => setActive(t.status)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                t.status === active ? 'bg-surface-hover text-foreground' : 'text-subtle hover:text-foreground'
              }`}
            >
              {t.label} ({patterns.filter((p) => p.status === t.status).length})
            </button>
          ))}
        </div>
      </div>

      {update.error && (
        <p role="alert" className="shrink-0 rounded-2xl bg-negative-soft p-4 text-sm text-negative">
          {update.error.message}
        </p>
      )}

      <div role="tabpanel" id="pattern-panel" className="flex min-h-0 flex-col" aria-labelledby={`tab-${active}`}>
        {rows.length === 0 ? (
          <p className="rounded-3xl bg-surface py-16 text-center text-sm text-muted">{tab.empty}</p>
        ) : (
          <ul className="min-h-0 space-y-3 overflow-y-auto rounded-3xl bg-surface p-3">
            {rows.map((p) => (
              <li key={p.id}>
                <PatternCard
                  pattern={p}
                  on={active === 'enabled'}
                  disabled={update.isPending}
                  onToggle={() => update.mutate(active === 'enabled' ? { disable: [p.id] } : { enable: [p.id] })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
