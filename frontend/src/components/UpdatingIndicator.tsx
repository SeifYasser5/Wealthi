interface Props {
  query: { isFetching: boolean; isLoading: boolean }
  className?: string
}

/** "Updating…" while a query refetches over data already on screen. The first load is QueryState's job. */
export function UpdatingIndicator({ query, className = '' }: Props) {
  if (!query.isFetching || query.isLoading) return null
  return <span className={`text-primary ${className}`}>Updating…</span>
}
