import type { ReactNode } from 'react'

/**
 * The red strip that asks before a delete: what will happen, a way back, and
 * why the server refused if it did.
 */
export function ConfirmDelete({
  children,
  pending,
  error,
  onKeep,
  onConfirm,
}: {
  children: ReactNode
  pending: boolean
  error: Error | null
  onKeep: () => void
  onConfirm: () => void
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-negative-soft p-4">
      <p className="min-w-0 flex-1 text-sm text-negative">{children}</p>
      <button
        type="button"
        onClick={onKeep}
        className="h-9 rounded-full px-4 text-sm font-medium text-subtle transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        Keep it
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="h-9 rounded-full bg-negative px-4 text-sm font-semibold text-on-primary transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-negative disabled:cursor-wait"
      >
        Delete
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-negative">
          {error.message}
        </p>
      )}
    </div>
  )
}
