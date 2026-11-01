import { useCategories } from '../../../hooks/useCategories'
import { useUpdateTransactionCategory } from '../../../hooks/useSpending'

/**
 * Assigns a category to a single transaction. The mutation is shared across all
 * rows, so `pending`/`error` are scoped by comparing the in-flight id to this row's.
 */
export function CategorySelect({ transactionId }: { transactionId: string }) {
  const { data: categoryData } = useCategories()
  const mutation = useUpdateTransactionCategory()

  const isThisRow = mutation.variables?.id === transactionId
  const pending = mutation.isPending && isThisRow
  const failed = mutation.isError && isThisRow

  return (
    <div className="flex flex-col items-end gap-0.5">
      <select
        // Always renders as the placeholder: a successful assignment removes the
        // row from this list entirely, so there is no selected state to keep.
        value=""
        disabled={pending || !categoryData}
        onChange={(e) => {
          const next = e.target.value
          if (next) mutation.mutate({ id: transactionId, categoryId: Number(next) })
        }}
        className={`rounded-full border bg-surface-raised px-3 py-1 text-xs font-medium text-subtle transition-colors hover:bg-surface-hover hover:text-foreground focus:border-primary focus:outline-none disabled:cursor-wait disabled:text-muted ${
          failed ? 'border-negative' : 'border-transparent'
        }`}
      >
        <option value="">{pending ? 'Saving…' : 'Categorize…'}</option>
        {categoryData?.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {failed && (
        <span className="text-[10px] text-negative">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save'}
        </span>
      )}
    </div>
  )
}
