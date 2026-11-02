import type {
  Account,
  AccountBalance,
  AccountSource,
  Category,
  ImportResponse,
  InsightRow,
  LearnResponse,
  PatternRow,
  ManualTransaction,
  Schedule,
  SpendingResponse,
  Transaction,
  TransferRule,
} from '@wealthi/shared'

// Synthetic API payloads — never real accounts, merchants or amounts.

export const ACCOUNTS: Account[] = [
  { id: 'checking', label: 'Checking', currency: 'EGP', openingBalance: 1000 },
  { id: 'card', label: 'Credit Card', currency: 'EGP', openingBalance: -250.5 },
  { id: 'savings_usd', label: 'Savings (USD)', currency: 'USD', openingBalance: 0 },
]

/** GET /api/account-sources, by key. */
export const ACCOUNT_SOURCES: AccountSource[] = [
  { source: 'test-bank:1111', account: 'checking' },
  { source: 'test-bank:2222', account: 'card' },
]

/** GET /api/transfer-rules, a merchant ahead of the catch-all. */
export const TRANSFER_RULES: TransferRule[] = [
  { id: 1, account: 'checking', type: 'debit', merchant: 'CARD PAYMENT', counterAccount: 'card' },
  { id: 2, account: 'savings_usd', type: 'credit', merchant: '', counterAccount: 'checking' },
]

/** GET /api/bank-senders, by name. */
export const BANK_SENDERS = ['+15550001111', 'Test Bank']

/** GET /api/categories, in position order. Rent is the only one nothing uses. */
export const CATEGORIES: Category[] = [
  { id: 1, name: 'Dining', position: 0, budget: null, transactionCount: 0, scheduleCount: 0, merchants: ['CITY CAFE'] },
  { id: 2, name: 'Groceries', position: 1, budget: 1000, transactionCount: 2, scheduleCount: 1, merchants: ['ACME GROCERS', 'CORNER SHOP'] }, // prettier-ignore
  { id: 3, name: 'Rent', position: 2, budget: null, transactionCount: 0, scheduleCount: 0, merchants: [] },
]

let n = 0
export function tx(over: Partial<Transaction> & Pick<Transaction, 'type' | 'amount'>): Transaction {
  n++
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    yearMonth: '2026-01',
    currency: 'EGP',
    account: 'checking',
    merchant: null,
    categoryId: null,
    category: null,
    counterAccount: null,
    reportedBalance: null,
    transactedAt: '2026-01-10T12:00:00.000Z',
    createdAt: '2026-01-10T12:00:00.000Z',
    isTransfer: false,
    rawText: null,
    scheduleId: null,
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
    scheduleId: 2,
  }),
]

/** GET /api/schedules, by start date: one running, one ended. */
export const SCHEDULES: Schedule[] = [
  {
    id: 2,
    type: 'credit',
    amount: 20,
    currency: 'USD',
    account: 'savings_usd',
    merchant: 'INTEREST',
    categoryId: null,
    category: null,
    frequency: 'weekly',
    interval: 2,
    startDate: '2025-12-29',
    endDate: '2026-01-26',
    nextDate: null,
    transactionCount: 3,
  },
  {
    id: 1,
    type: 'debit',
    amount: 1500,
    currency: 'EGP',
    account: 'checking',
    merchant: 'RENT',
    categoryId: 3,
    category: 'Rent',
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-31',
    endDate: null,
    nextDate: '2026-02-28',
    transactionCount: 1,
  },
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

/** A clean import: every message parsed. */
export const IMPORT_REPORT: ImportResponse = {
  status: 'completed',
  source: '/data/chat.db',
  finishedAt: '2026-02-01T09:30:00.000Z',
  durationMs: 2345,
  months: 3,
  totalStored: 42,
  parseErrors: [],
}

const pattern = (over: Partial<PatternRow> & Pick<PatternRow, 'id' | 'status'>): PatternRow => ({
  bank: 'test-bank',
  type: 'debit',
  pattern: 'Card {account:MASKED} charged {currency:CUR} {amount:NUM} at {merchant:TEXT}',
  reason: 'charged → debit',
  review: [],
  messages: 12,
  missing: false,
  learnedAt: '2026-01-15T09:30:00.000Z',
  ...over,
})

/** What GET /api/patterns holds before any learn run: one reviewed each way. */
export const PATTERNS: PatternRow[] = [
  pattern({ id: 'test-bank:charge', status: 'enabled' }),
  pattern({
    id: 'test-bank:refund',
    status: 'disabled',
    type: 'credit',
    pattern: 'Refund of {currency:CUR} {amount:NUM} to card {account:MASKED}',
    reason: 'refund → credit',
    messages: 0,
    missing: true,
  }),
]

/** What the next learn run finds that PATTERNS doesn't hold; stored pending. */
export const LEARNED: PatternRow[] = [
  pattern({
    id: 'test-bank:transfer',
    status: 'pending',
    pattern: 'Transfer of {currency:CUR} {amount:NUM} to {counterparty:TEXT}',
    reason: 'transfer → debit',
    messages: 4,
  }),
  pattern({
    id: 'test-bank:deposit',
    status: 'pending',
    type: 'credit',
    pattern: 'Deposit {currency:CUR} {amount:NUM} into {account:MASKED}',
    reason: 'deposit → credit',
    review: ['seen in only 2 messages'],
    messages: 2,
  }),
]

/** A learn run; `added` is filled in by the fake backend. */
export const LEARN_REPORT: LearnResponse = {
  status: 'completed',
  source: '/data/chat.db',
  finishedAt: '2026-02-01T09:30:00.000Z',
  durationMs: 1250,
  messages: 120,
  undecodable: 0,
  added: 0,
}

let insightId = 0
function insight(
  transactedAt: string,
  type: InsightRow['type'],
  amount: number,
  merchant: string | null,
  category: string,
  over: Partial<InsightRow> = {},
): InsightRow {
  // prettier-ignore
  insightId++
  return {
    id: `10000000-0000-4000-8000-${String(insightId).padStart(12, '0')}`,
    yearMonth: transactedAt.slice(0, 7),
    transactedAt: `${transactedAt}T12:00:00.000Z`,
    type,
    amount,
    currency: 'EGP',
    account: type === 'credit' ? 'checking' : 'card',
    merchant,
    category,
    ...over,
  }
}

/**
 * GET /api/insights, oldest first: December 2025 to March 2026, pinned against
 * a clock of 20 March 2026. In EGP over the default six months: 1,390 spent
 * (Groceries 1,100, Dining 250, Uncategorized 40) and 15,000 received.
 */
export const INSIGHT_ROWS: InsightRow[] = [
  insight('2025-12-20', 'debit', 150, 'ACME GROCERS', 'Groceries'),
  insight('2026-01-10', 'debit', 250, 'ACME GROCERS', 'Groceries'),
  insight('2026-01-12', 'debit', 100, 'CITY CAFE', 'Dining'),
  insight('2026-01-15', 'credit', 5000, 'EMPLOYER LTD', 'Uncategorized'),
  insight('2026-02-03', 'debit', 40, null, 'Uncategorized', { account: 'checking' }),
  insight('2026-02-07', 'debit', 400, 'ACME GROCERS', 'Groceries'),
  insight('2026-02-15', 'credit', 5000, 'EMPLOYER LTD', 'Uncategorized'),
  insight('2026-02-20', 'debit', 60, 'CITY CAFE', 'Dining'),
  insight('2026-03-02', 'credit', 5000, 'EMPLOYER LTD', 'Uncategorized'),
  insight('2026-03-04', 'debit', 20, 'ONLINE STORE', 'Uncategorized', { currency: 'USD', account: 'savings_usd' }),
  insight('2026-03-05', 'debit', 300, 'ACME GROCERS', 'Groceries'),
  insight('2026-03-10', 'debit', 90, 'CITY CAFE', 'Dining'),
]

/** The clock INSIGHT_ROWS are read against. */
export const INSIGHTS_NOW = new Date('2026-03-20T12:00:00.000Z')

/** GET /api/manual-transactions, newest first. */
export const MANUAL_TRANSACTIONS: ManualTransaction[] = [
  {
    id: 2,
    type: 'credit',
    amount: 5,
    currency: 'EGP',
    account: 'checking',
    merchant: 'CASHBACK',
    categoryId: null,
    category: null,
    date: '2026-01-20',
  },
  {
    id: 1,
    type: 'debit',
    amount: 50,
    currency: 'EGP',
    account: 'checking',
    merchant: 'Bank fee',
    categoryId: 3,
    category: 'Rent',
    date: '2026-01-15',
  },
]
