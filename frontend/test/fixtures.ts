import type { Account, AccountBalance, SpendingResponse, Transaction } from '@wealthi/shared'

// Synthetic API payloads — never real accounts, merchants or amounts.

export const ACCOUNTS: Account[] = [
  { id: 'checking', label: 'Checking', currency: 'EGP' },
  { id: 'card', label: 'Credit Card', currency: 'EGP' },
  { id: 'savings_usd', label: 'Savings (USD)', currency: 'USD' },
]

export const CATEGORIES = ['Dining', 'Groceries', 'Rent']

let n = 0
export function tx(over: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    yearMonth: '2026-01',
    currency: 'EGP',
    account: 'checking',
    merchant: null,
    category: null,
    counterAccount: null,
    reportedBalance: null,
    transactedAt: '2026-01-10T12:00:00.000Z',
    createdAt: '2026-01-10T12:00:00.000Z',
    isTransfer: false,
    rawText: null,
    ...over,
  }
}

/** January, newest first as the API returns it. */
export const JANUARY: Transaction[] = [
  tx({
    type: 'debit',
    amount: 250,
    account: 'checking',
    merchant: 'CARD PAYMENT',
    counterAccount: 'card',
    isTransfer: true,
    reportedBalance: 5750,
    transactedAt: '2026-01-20T12:00:00.000Z',
  }),
  tx({
    type: 'credit',
    amount: 5000,
    account: 'checking',
    merchant: 'EMPLOYER LTD',
    reportedBalance: 6000,
    transactedAt: '2026-01-15T12:00:00.000Z',
    rawText: 'Account *1111 credited with EGP 5,000.00 from EMPLOYER LTD. Balance EGP 6,000.00',
  }),
  tx({
    type: 'debit',
    amount: 250,
    account: 'card',
    merchant: 'ACME GROCERS',
    reportedBalance: 4750,
    transactedAt: '2026-01-10T12:00:00.000Z',
  }),
  tx({
    type: 'credit',
    amount: 20,
    currency: 'USD',
    account: 'savings_usd',
    merchant: null,
    transactedAt: '2026-01-05T12:00:00.000Z',
  }),
]

export function balance(over: Partial<AccountBalance> & Pick<AccountBalance, 'account'>): AccountBalance {
  return {
    yearMonth: '2026-01',
    openingBalance: 0,
    debits: 0,
    credits: 0,
    transfersIn: 0,
    transfersOut: 0,
    closingBalance: 0,
    lastReportedBalance: null,
    discrepancy: null,
    ...over,
  }
}

export const JANUARY_BALANCES: AccountBalance[] = [
  balance({
    account: 'card',
    debits: 250,
    transfersIn: 250,
    closingBalance: 0,
    lastReportedBalance: 4750,
    discrepancy: -4750,
  }),
  balance({
    account: 'checking',
    openingBalance: 1000,
    credits: 5000,
    debits: 250,
    closingBalance: 5750,
    lastReportedBalance: 5750,
    discrepancy: 0,
  }),
  balance({ account: 'savings_usd', credits: 20, closingBalance: 20 }),
]

export const UNCATEGORIZED_ID = '00000000-0000-4000-8000-00000000c1f3'
export const LARGE_ID = '00000000-0000-4000-8000-00000000b16b'

export const JANUARY_SPENDING: SpendingResponse = {
  yearMonth: '2026-01',
  grandTotal: 1000,
  categories: [
    {
      category: 'Groceries',
      total: 600,
      merchants: [
        { merchant: 'ACME GROCERS', total: 450 },
        { merchant: 'CORNER SHOP', total: 150 },
      ],
    },
    { category: 'Dining', total: 100, merchants: [{ merchant: 'CITY CAFE', total: 100 }] },
    { category: 'Uncategorized', total: 20, merchants: [{ merchant: 'MYSTERY', total: 20 }] },
  ],
  largeTransactions: [{ id: LARGE_ID, merchant: 'BIG PURCHASE', amount: 280, account: 'card', pct: 28 }],
  uncategorized: [
    {
      id: UNCATEGORIZED_ID,
      merchant: 'MYSTERY',
      amount: 20,
      account: 'card',
      transactedAt: '2026-01-12T12:00:00.000Z',
      pct: 2,
    },
  ],
}
