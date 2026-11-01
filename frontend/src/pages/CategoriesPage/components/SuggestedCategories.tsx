import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import type { Category, CategorySuggestion } from '@wealthi/shared'
import { Select } from '../../../components/Select'
import { useAddSuggestion, useCategories, useCategorySuggestions } from '../../../hooks/useCategories'
import { money, plural } from '../../../utils/utils'

const NEW = 'new'

/** Files the merchant under a new category named after it, or an existing one. */
function AddToCategory({ merchant, categories }: { merchant: string; categories: Category[] }) {
  const [target, setTarget] = useState(NEW)
  const add = useAddSuggestion()

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={target} onChange={setTarget} disabled={add.isPending} label={`Category for ${merchant}`}>
          <option value={NEW}>New category</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          disabled={add.isPending}
          onClick={() => add.mutate({ merchant, categoryId: target === NEW ? null : Number(target) })}
          className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:bg-primary-soft disabled:text-primary"
          aria-label={`Add ${merchant}`}
        >
          Add
        </button>
      </div>
      {add.error && (
        <p role="alert" className="mt-2 text-xs text-negative">
          {add.error.message}
        </p>
      )}
    </div>
  )
}

function Suggestion({
  suggestion,
  minRepeats,
  categories,
}: {
  suggestion: CategorySuggestion
  minRepeats: number
  categories: Category[]
}) {
  const { merchant, count, amounts, others } = suggestion
  return (
    <li aria-label={merchant} className="rounded-2xl bg-surface-raised p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate font-semibold text-foreground">{merchant}</h3>
        <span className="shrink-0 text-xs text-muted">{plural(count, 'debit')}</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {amounts.map((a) => (
          <li
            key={`${a.currency}:${a.amount}`}
            className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary"
          >
            {money(a.amount)} {a.currency} × {a.count}
          </li>
        ))}
        {others > 0 && (
          <li
            title={`Amounts charged fewer than ${minRepeats} times`}
            className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-subtle"
          >
            Others × {others}
          </li>
        )}
      </ul>
      <AddToCategory merchant={merchant} categories={categories} />
    </li>
  )
}

/**
 * Merchants that keep coming back and have no category yet, each broken down
 * into the amounts it repeated and the rest. Shows nothing while loading, on an
 * error, or when no merchant repeats enough: it is a hint, not a requirement.
 */
export function SuggestedCategories() {
  const { data } = useCategorySuggestions()
  const categories = useCategories().data?.categories ?? []
  const [open, setOpen] = useState(false)
  if (!data || data.suggestions.length === 0) return null

  return (
    <section aria-label="Suggested categories" className="shrink-0 rounded-3xl bg-surface p-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 font-semibold text-foreground"
      >
        <Sparkles aria-hidden className="size-4 text-primary" />
        <span className="flex-1 text-left">Suggested categories</span>
        <span className="text-xs font-normal text-muted">{data.suggestions.length} found</span>
        {open ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
      </button>
      {open && (
        <>
          <p className="mt-1 text-xs text-muted">
            Merchants with {data.minRepeats} or more debits and no category. An amount charged {data.minRepeats} or more
            times is listed on its own; the rest are Others.
          </p>
          <ul className="mt-4 grid max-h-56 gap-3 overflow-y-auto md:grid-cols-2">
            {data.suggestions.map((s) => (
              <Suggestion key={s.merchant} suggestion={s} minRepeats={data.minRepeats} categories={categories} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
