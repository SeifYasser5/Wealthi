import type { ReactNode } from 'react'

interface Props<T> {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined }
  /** True when the request succeeded but there is nothing to show. */
  isEmpty?: (data: T) => boolean
  /** Shown when the error carries no message of its own. */
  errorMessage: string
  emptyMessage: string
  children: (data: T) => ReactNode
}

/**
 * The loading / error / empty ladder every page puts under its header.
 *
 * `children` is a function so the content is only built once there is data to
 * build it from — which also narrows `data` to non-undefined for the caller.
 */
export function QueryState<T>({ query, isEmpty, errorMessage, emptyMessage, children }: Props<T>) {
  const panel = 'rounded-2xl bg-surface py-16 text-center text-muted'

  if (query.isLoading) return <div className={panel}>Loading…</div>

  if (query.isError) {
    return (
      <div className="rounded-2xl bg-negative-soft py-16 text-center text-negative">
        {query.error instanceof Error ? query.error.message : errorMessage}
      </div>
    )
  }

  if (query.data === undefined || isEmpty?.(query.data)) return <div className={panel}>{emptyMessage}</div>

  return <>{children(query.data)}</>
}
