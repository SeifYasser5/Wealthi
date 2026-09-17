import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AccountId } from '../lib/accounts'
import { useAccounts } from './useAccounts'
import type { TransactionType, TransferFilter } from '../lib/api'
import { currentYearMonth, isYearMonth } from '../lib/yearMonth'

export interface Filters {
  yearMonth: string
  account: AccountId | ''
  merchant: string
  /** '' means "both directions". */
  type: TransactionType | ''
  /** '' means "no transfer filter" — show transfers and non-transfers alike. */
  transfer: TransferFilter | ''
  counterAccount: AccountId | ''
}

function isTransferFilter(value: string): value is TransferFilter {
  return value === 'only' || value === 'exclude'
}

function isTransactionType(value: string): value is TransactionType {
  return value === 'debit' || value === 'credit'
}

/**
 * Reads the transaction filters straight out of the URL query string and
 * exposes setters that write them back. The URL is the single source of truth,
 * so changing a filter updates the address bar and any consumer re-renders.
 */
export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isLoaded, isAccountId } = useAccounts()
  // Until the account list loads, trust the URL; the backend still validates it.
  const knownAccount = useCallback((id: string) => !isLoaded || isAccountId(id), [isLoaded, isAccountId])

  const filters = useMemo<Filters>(() => {
    const rawYearMonth = searchParams.get('yearMonth')
    const rawAccount = searchParams.get('account')
    const rawType = searchParams.get('type')
    const rawTransfer = searchParams.get('transfer')
    const rawCounterAccount = searchParams.get('counterAccount')
    const transfer = rawTransfer && isTransferFilter(rawTransfer) ? rawTransfer : ''
    return {
      yearMonth: rawYearMonth && isYearMonth(rawYearMonth) ? rawYearMonth : currentYearMonth(),
      account: rawAccount && knownAccount(rawAccount) ? rawAccount : '',
      merchant: searchParams.get('merchant') ?? '',
      type: rawType && isTransactionType(rawType) ? rawType : '',
      transfer,
      // A counter account alongside transfer=exclude can never match a row, so a
      // hand-edited URL carrying both is read as the exclusion it asked for.
      counterAccount:
        rawCounterAccount && knownAccount(rawCounterAccount) && transfer !== 'exclude' ? rawCounterAccount : '',
    }
  }, [searchParams, knownAccount])

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
