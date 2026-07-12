import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AccountId } from '../lib/accounts'
import { isAccountId } from '../lib/accounts'
import { currentYearMonth, isYearMonth } from '../lib/yearMonth'

export interface Filters {
  yearMonth: string
  account: AccountId | ''
  merchant: string
}

/**
 * Reads the transaction filters straight out of the URL query string and
 * exposes setters that write them back. The URL is the single source of truth,
 * so changing a filter updates the address bar and any consumer re-renders.
 */
export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo<Filters>(() => {
    const rawYearMonth = searchParams.get('yearMonth')
    const rawAccount = searchParams.get('account')
    return {
      yearMonth: rawYearMonth && isYearMonth(rawYearMonth) ? rawYearMonth : currentYearMonth(),
      account: rawAccount && isAccountId(rawAccount) ? rawAccount : '',
      merchant: searchParams.get('merchant') ?? '',
    }
  }, [searchParams])

  // Merge a partial update into the existing params; empty values are removed
  // so the URL stays clean. Preserves keys we don't touch.
  const update = useCallback(
    (patch: Partial<Filters>) => {
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

  return { filters, update }
}
