import { describe, expect, it } from 'vitest'
import { stageManualTransactions } from '../../src/utils/helpers/manual-transactions'
import type { Minor } from '../../src/utils/money'
import type { StoredManualTransaction } from '../../src/utils/types'

const entry: StoredManualTransaction = {
  id: 7,
  type: 'credit',
  amount: 500 as Minor,
  currency: 'EGP',
  account: 'checking',
  merchant: 'CASHBACK',
  categoryId: 3,
  date: '2026-03-15',
}

describe('stageManualTransactions', () => {
  it('stages an entry as a ledger row on its local day, bucketed by month', () => {
    const [staged] = stageManualTransactions([entry])
    expect(staged).toMatchObject({
      type: 'credit',
      amount: 500,
      merchant: 'CASHBACK',
      categoryId: 3,
      yearMonth: '2026-03',
      counterAccount: null,
      reportedBalance: null,
    })
    expect(staged.transactedAt).toEqual(new Date(2026, 2, 15))
    expect(staged).not.toHaveProperty('id')
  })

  it('is empty for no entries', () => {
    expect(stageManualTransactions([])).toEqual([])
  })
})
