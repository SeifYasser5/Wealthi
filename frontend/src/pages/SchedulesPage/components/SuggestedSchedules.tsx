import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import type { ScheduleSuggestion } from '@wealthi/shared'
import { useAccounts } from '../../../hooks/useAccounts'
import { useScheduleSuggestions } from '../../../hooks/useSchedules'
import type { ScheduleSeed } from './ScheduleForm'
import { formatCalendarDay, money, plural } from '../../../utils/utils'

/** The schedule a suggestion would become: monthly, from next month, at the average amount, on its busiest account. */
function scheduleOf({ merchant, type, average, accounts, nextDate }: ScheduleSuggestion): ScheduleSeed {
  return { merchant, type, amount: average, account: accounts[0].account, startDate: nextDate }
}

function Suggestion({ suggestion, onUse }: { suggestion: ScheduleSuggestion; onUse: () => void }) {
  const { merchant, type, currency, months, accounts, min, max, average, spread } = suggestion
  const { label } = useAccounts()
  return (
    <li aria-label={merchant} className="rounded-2xl bg-surface-raised p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate font-semibold text-foreground">{merchant}</h3>
        <span className="shrink-0 text-xs text-muted">{plural(months, 'month')}</span>
      </div>
      <p className="mt-1 text-sm text-subtle">
        {type === 'credit' ? 'Money in' : 'Money out'} · about {money(average)} {currency}
      </p>
      <p className="mt-1 text-xs text-muted">
        {spread === 0
          ? `Always ${money(min)} ${currency}`
          : `${money(min)}–${money(max)} ${currency} · varies by ${spread}%`}
      </p>
      <ul aria-label={`Accounts for ${merchant}`} className="mt-2 flex flex-wrap gap-2">
        {accounts.map((a) => (
          <li key={a.account} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            {label(a.account)} × {a.count}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Next {formatCalendarDay(suggestion.nextDate)}</span>
        <button
          type="button"
          onClick={onUse}
          aria-label={`Schedule ${merchant}`}
          className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Schedule
        </button>
      </div>
    </li>
  )
}

/**
 * Merchants charged once a month with no schedule yet, with the accounts they
 * were charged to and how much the amount moved. "Schedule" opens the new
 * schedule form filled in from the suggestion. Shows nothing while loading, on
 * an error, or when nothing repeats: it is a hint, not a requirement.
 */
export function SuggestedSchedules({ onUse }: { onUse: (schedule: ScheduleSeed) => void }) {
  const { data } = useScheduleSuggestions()
  const [open, setOpen] = useState(false)
  if (!data || data.suggestions.length === 0) return null

  return (
    <section aria-label="Suggested schedules" className="shrink-0 rounded-3xl bg-surface p-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 font-semibold text-foreground"
      >
        <Sparkles aria-hidden className="size-4 text-primary" />
        <span className="flex-1 text-left">Suggested schedules</span>
        <span className="text-xs font-normal text-muted">{data.suggestions.length} found</span>
        {open ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
      </button>
      {open && (
        <>
          <p className="mt-1 text-xs text-muted">
            Merchants charged exactly once in each of {data.minMonths} or more months and not scheduled yet. The amount
            and the account may change from month to month. A schedule starts next month, so it does not repeat what the
            ledger already has.
          </p>
          <ul className="mt-4 grid max-h-64 gap-3 overflow-y-auto md:grid-cols-2">
            {data.suggestions.map((s) => (
              <Suggestion
                key={`${s.merchant}:${s.type}:${s.currency}`}
                suggestion={s}
                onUse={() => onUse(scheduleOf(s))}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
