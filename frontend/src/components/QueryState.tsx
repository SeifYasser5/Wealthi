import type { ReactNode } from 'react'

interface Props<T> {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined }
  /** True when the request succeeded but there is nothing to show. */
  isEmpty?: (data: T) => boolean
  /** Shown when the error carries no message of its own. */
  errorMessage: string
  emptyMessage: string
  /** Background for the loading/empty panel, to match the page around it. */
  surface?: string
  children: (data: T) => ReactNode
}

/**
 * The loading / error / empty ladder every page puts under its header.
 *
 * `children` is a function so the content is only built once there is data to
 * build it from — which also narrows `data` to non-undefined for the caller.
 */
export function QueryState<T>({
  query,
  isEmpty,
  errorMessage,
  emptyMessage,
  surface = 'bg-[#f0f0f3]',
  children,
}: Props<T>) {
  const panel = `rounded-2xl py-16 text-center ${surface} text-[#9a9ba8]`

  if (query.isLoading) return <div className={panel}>Loading…</div>

  if (query.isError) {
    return (
      <div className="rounded-2xl bg-[#ff3b30]/10 py-16 text-center text-[#ff3b30]">
        {query.error instanceof Error ? query.error.message : errorMessage}
      </div>
    )
  }

  if (query.data === undefined || isEmpty?.(query.data)) return <div className={panel}>{emptyMessage}</div>

  return <>{children(query.data)}</>
}
