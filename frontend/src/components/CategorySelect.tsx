import { useCategories, useUpdateTransactionCategory } from '../hooks/useSpending'

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
          if (next) mutation.mutate({ id: transactionId, category: next })
        }}
        className={`rounded-lg border px-2 py-1 text-xs text-[#6b6d80] transition disabled:opacity-50 ${
          failed ? 'border-[#ff3b30]' : 'border-[#dde0e6]'
        } bg-white hover:border-[#0666eb] focus:border-[#0666eb] focus:outline-none`}
      >
        <option value="">{pending ? 'Saving…' : 'Categorize…'}</option>
        {categoryData?.categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {failed && (
        <span className="text-[10px] text-[#ff3b30]">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save'}
        </span>
      )}
    </div>
  )
}
