import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { Category, SpendingResponse } from '@wealthi/shared'
import { QueryState } from '../../../components/QueryState'
import { useCategories, useReorderCategories, useSetCategoryBudget } from '../../../hooks/useCategories'
import { money, plural } from '../../../utils/utils'

/**
 * The Spending page's other face: every category in the order set here (the
 * Categories page's order), each with a monthly allowance to fill in or leave
 * empty, and how much of it the month has spent.
 */
export function BudgetView({ spending }: { spending: SpendingResponse }) {
  const categories = useCategories()
  const reorder = useReorderCategories()
  // The id being dragged, and the row it is hovering over (where it would land).
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  const spent = new Map(spending.categories.map((row) => [row.category, row.total]))

  return (
    <QueryState
      query={categories}
      isEmpty={(data) => data.categories.length === 0}
      errorMessage="Failed to load categories"
      emptyMessage="No categories yet. Add some on the Categories page."
    >
      {({ categories: list }) => {
        const budgeted = list.filter((c) => c.budget !== null)
        const totalBudget = budgeted.reduce((sum, c) => sum + (c.budget as number), 0)
        const totalSpent = budgeted.reduce((sum, c) => sum + (spent.get(c.name) ?? 0), 0)

        // The backend takes the whole order, so a drop moves one id to its target's slot and sends every id.
        const drop = (targetId: number) => {
          const from = dragId
          setDragId(null)
          setOverId(null)
          if (from === null || from === targetId) return
          const ids = list.map((c) => c.id).filter((id) => id !== from)
          const at = list.findIndex((c) => c.id === targetId)
          ids.splice(at, 0, from)
          reorder.mutate(ids)
        }

        return (
          <>
            <div className="mb-4 flex shrink-0 items-end justify-between px-1">
              <span className="text-sm text-muted">
                {plural(budgeted.length, 'budget')} set · {money(totalSpent)} spent
              </span>
              <span className="text-sm text-subtle">
                Total budget{' '}
                <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                  {money(totalBudget)}
                </span>
              </span>
            </div>
            {reorder.error && (
              <p role="alert" className="mb-2 rounded-2xl bg-negative-soft p-4 text-sm text-negative">
                {reorder.error.message}
              </p>
            )}
            <ul aria-label="Budgets" className="min-h-0 space-y-2 overflow-y-auto">
              {list.map((category) => (
                <BudgetRow
                  key={category.id}
                  category={category}
                  spent={spent.get(category.name) ?? 0}
                  dragging={dragId === category.id}
                  target={overId === category.id && dragId !== category.id}
                  busy={reorder.isPending}
                  onDragStart={() => setDragId(category.id)}
                  onDragOver={() => setOverId(category.id)}
                  onDrop={() => drop(category.id)}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverId(null)
                  }}
                />
              ))}
            </ul>
          </>
        )
      }}
    </QueryState>
  )
}

function BudgetRow({
  category,
  spent,
  dragging,
  target,
  busy,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  category: Category
  spent: number
  dragging: boolean
  target: boolean
  busy: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const { name, budget } = category
  const setBudget = useSetCategoryBudget()
  const stored = budget === null ? '' : String(budget)
  const [draft, setDraft] = useState(stored)
  const [seen, setSeen] = useState(stored)
  // Follow the stored value when it changes underneath, e.g. after a save.
  if (seen !== stored) {
    setSeen(stored)
    setDraft(stored)
  }

  const [editing, setEditing] = useState(false)

  // A zero budget is spent as soon as anything is.
  const pct = budget === null ? 0 : budget > 0 ? (spent / budget) * 100 : spent > 0 ? 100 : 0
  const over = budget !== null && spent > budget

  const commit = () => {
    setEditing(false)
    const text = draft.trim()
    if (text === stored) return
    const next = text === '' ? null : Number(text.replace(/,/g, ''))
    if (next !== null && (!Number.isFinite(next) || next < 0)) return setDraft(stored)
    setBudget.mutate({ id: category.id, budget: next }, { onError: () => setDraft(stored) })
  }

  const cancel = () => {
    setEditing(false)
    setDraft(stored)
  }

  return (
    <li
      aria-label={name}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      className={`flex items-center gap-3 rounded-2xl bg-surface px-5 py-4 ${
        dragging ? 'bg-surface-hover' : ''
      } ${target ? 'outline-2 outline-primary' : ''}`}
    >
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Drag ${name} to reorder`}
        title="Drag to reorder"
        draggable={!busy}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setDragImage(e.currentTarget.closest('li') as HTMLElement, 0, 0)
          onDragStart()
        }}
        onDragEnd={onDragEnd}
        className="grid size-8 shrink-0 cursor-grab place-items-center rounded-full text-subtle hover:bg-surface-hover hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-semibold text-foreground">{name}</span>
          {editing ? (
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              aria-label={`Budget for ${name}`}
              placeholder="0"
              value={draft}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') cancel()
              }}
              className="h-10 w-36 rounded-xl bg-surface-hover px-3 text-right text-2xl font-bold tracking-tight tabular-nums text-foreground placeholder-muted focus:outline-2 focus:outline-primary"
            />
          ) : budget === null ? (
            <button
              type="button"
              aria-label={`Set budget for ${name}`}
              onClick={() => setEditing(true)}
              className="shrink-0 rounded-full bg-primary-soft px-3.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"
            >
              Set budget
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Edit budget for ${name}`}
              onClick={() => setEditing(true)}
              className="-mr-2 shrink-0 rounded-xl px-2 py-0.5 text-2xl font-bold tracking-tight tabular-nums text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"
            >
              {money(budget)}
            </button>
          )}
        </div>
        <div
          role="progressbar"
          aria-label={`${name} spent`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(pct, 100))}
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
        >
          <div
            className={`h-full rounded-full transition-all ${over ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">{money(spent)} spent</span>
          {budget !== null && (
            <span className={`font-medium tabular-nums ${over ? 'text-warning' : 'text-muted'}`}>
              {over ? `${money(spent - budget)} over` : `${money(budget - spent)} left`}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
