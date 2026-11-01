import type { Category } from '@wealthi/shared'
import { useDeleteCategory, useReorderCategories } from '../../../hooks/useCategories'
import { CategoryItem } from './CategoryItem'

/** Every category in order, each movable one place up or down. */
export function CategoryList({ categories }: { categories: Category[] }) {
  const reorder = useReorderCategories()
  const remove = useDeleteCategory()
  const busy = reorder.isPending || remove.isPending
  const error = reorder.error ?? remove.error

  // The backend takes the whole order, so a move swaps two neighbours and sends every id.
  const move = (index: number, by: -1 | 1) => {
    const ids = categories.map((c) => c.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    remove.reset()
    reorder.mutate(ids)
  }

  return (
    <section aria-label="Your categories" className="flex min-h-0 flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-2xl bg-negative-soft p-4 text-sm text-negative">
          {error.message}
        </p>
      )}
      <ul className="min-h-0 divide-y divide-line overflow-y-auto rounded-3xl bg-surface">
        {categories.map((category, index) => (
          <CategoryItem
            key={category.id}
            category={category}
            first={index === 0}
            last={index === categories.length - 1}
            busy={busy}
            onMove={(by) => move(index, by)}
            onDelete={() => {
              reorder.reset()
              remove.mutate(category.id)
            }}
          />
        ))}
      </ul>
    </section>
  )
}
