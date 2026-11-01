import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { Currency } from '@wealthi/shared'
import { fetchInsights } from '../utils/api'
import { useAccounts } from './useAccounts'
import { parseView, type View } from '../utils/insights'
import { CURRENCIES } from '../utils/utils'

/** Every non-transfer row with its category resolved; each chart slices it in the browser. */
export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: ({ signal }) => fetchInsights(signal),
    placeholderData: keepPreviousData,
  })
}

/**
 * The Insights view, read from the URL query string and written back to it,
 * like the Transactions filters. `currencies` are the ones in use, most used
 * first: a URL naming another falls back to the first. `account` and `merchant`
 * are the same params the Transactions page filters by, so a narrowed view
 * stays narrowed across the nav bar.
 */
export function useInsightsView(currencies: readonly Currency[]) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isLoaded, isAccountId } = useAccounts()
  // Until the account list loads, trust the URL.
  const knownAccount = useCallback((id: string) => !isLoaded || isAccountId(id), [isLoaded, isAccountId])
  const raw = searchParams.get('currency')
  const currency = currencies.find((c) => c === raw) ?? currencies[0] ?? CURRENCIES[0]

  const view = useMemo(() => {
    const parsed = parseView(searchParams, currency)
    return knownAccount(parsed.account) ? parsed : { ...parsed, account: '' }
  }, [searchParams, currency, knownAccount])

  // Empty values are removed so the URL stays clean; keys not patched are kept.
  const update = useCallback(
    (patch: Partial<View>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return { view, update }
}
