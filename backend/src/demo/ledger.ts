/**
 * The public demo's ledger: six months of bank SMS from a made-up bank for one
 * made-up person — salary, rent, bills, card spending, a monthly card payment
 * and a monthly USD saving. Every name, merchant and card number is invented.
 *
 * Dates are relative to `now`, so the month the app opens on always has data.
 * Each month's transactions come from a PRNG seeded by its "YYYY-MM", so they
 * read the same on every start; the current month only grows as its days pass.
 *
 * The balances printed in the SMS are running balances from OPENING, which must
 * equal openingBalances in backend/demo/wealthi.demo.json: then every month
 * reconciles (discrepancy 0). Merchant strings are keys of its
 * merchantCategories and transferRules, so keep the two files in step.
 */

/** bankOf() of it is demo-bank, the bank of backend/demo/patterns/demo-bank.json. */
export const DEMO_SENDER = 'Demo Bank'
/** Every demo message guid starts with this; seedDemo() refuses a database holding any other. */
export const DEMO_GUID_PREFIX = 'demo-'
/**
 * Months generated, ending with the current one. Inside importer.ts's balance
 * window, so every month gets a snapshot seeded from openingBalances.
 */
export const DEMO_MONTHS = 6

export interface DemoMessage {
  sender: string
  /** Wall-clock instant the message arrived */
  date: Date
  text: string
  guid: string
}

type Account = 'checking' | 'card' | 'savings'

/** Opening balances of the first generated month, in minor units. */
export const OPENING: Record<Account, number> = { checking: 3_850_000, card: -745_000, savings: 120_000 }

const CARD_LIMIT = 4_000_000
const DIGITS: Record<Account, string> = { checking: '4821', card: '7390', savings: '2056' }

interface Event {
  date: Date
  account: Account
  type: 'debit' | 'credit'
  /** Minor units; null on the card payment, which pays whatever the card owes at that moment */
  amount: number | null
  party: string
}

/** [merchant, weight, min, max] — card purchases, amounts in whole pounds. */
const CARD_MERCHANTS: [string, number, number, number][] = [
  ['GREENLEAF MARKET', 6, 350, 1800],
  ['FRESH BASKET', 5, 150, 900],
  ['CAFE LUNA', 5, 90, 260],
  ['KOSHARY CORNER', 4, 60, 180],
  ['SAKURA SUSHI BAR', 2, 450, 1300],
  ['SWIFTCAB TRIP', 6, 45, 220],
  ['FUEL STATION 26', 2, 400, 900],
  ['URBAN THREADS', 1, 600, 2500],
  ['PAGES BOOKSTORE', 1, 150, 600],
  ['WELLCARE PHARMACY', 2, 80, 650],
  // Not in merchantCategories: lands in Uncategorized, ready to be assigned.
  ['KIOSK 24', 2, 15, 90],
]

/** mulberry32: a small, fast PRNG — plenty for made-up data, and stable across Node versions. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 123450 → "1,234.50" */
export function formatMinor(minor: number): string {
  const abs = Math.abs(minor)
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${minor < 0 ? '-' : ''}${whole}.${String(abs % 100).padStart(2, '0')}`
}

/** One month's events, unsorted. `month` is 0-based, as Date takes it. */
function monthEvents(year: number, month: number): Event[] {
  const random = prng(year * 100 + month + 1)
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
  const at = (day: number, hour = int(9, 21), minute = int(0, 59)) => new Date(year, month, day, hour, minute)
  const pounds = (lo: number, hi: number) => int(lo * 100, hi * 100)

  const events: Event[] = [
    { date: at(1, 9, 5), account: 'checking', type: 'debit', amount: 1_400_000, party: 'RENT TRANSFER' },
    { date: at(3), account: 'card', type: 'debit', amount: 19_900, party: 'STREAMFLIX MONTHLY' },
    { date: at(5), account: 'checking', type: 'debit', amount: pounds(650, 1400), party: 'ELECTRICITY BILL' },
    { date: at(7), account: 'checking', type: 'debit', amount: 45_000, party: 'NILECOM MOBILE' },
    { date: at(8), account: 'card', type: 'debit', amount: 9_900, party: 'TUNEBOX MUSIC' },
    { date: at(10), account: 'checking', type: 'debit', amount: 85_000, party: 'FASTLINK INTERNET' },
    { date: at(12, 10, 0), account: 'checking', type: 'debit', amount: null, party: 'CARD PAYMENT' },
    { date: at(12, 10, 5), account: 'card', type: 'credit', amount: null, party: 'CARD PAYMENT' },
    { date: at(15), account: 'card', type: 'debit', amount: 120_000, party: 'IRONWORKS GYM' },
    { date: at(25, 8, 30), account: 'checking', type: 'credit', amount: 5_200_000, party: 'NORTHWIND LABS PAYROLL' },
  ]

  // A monthly $200 saving, bought at that month's rate (EGP per USD, in piastres).
  const rate = int(4820, 5040)
  events.push(
    { date: at(26, 11, 0), account: 'checking', type: 'debit', amount: 200 * rate, party: 'USD SAVINGS' },
    { date: at(26, 11, 5), account: 'savings', type: 'credit', amount: 20_000, party: 'FX CONVERSION' },
  )

  if (random() < 0.4) {
    events.push({
      date: at(18),
      account: 'checking',
      type: 'credit',
      amount: pounds(4000, 9000),
      party: 'BLUEPRINT STUDIO',
    })
  }
  // A big uncategorized charge some months, so Spending shows it as its own line.
  if (random() < 0.5) {
    events.push({
      date: at(int(1, 28)),
      account: 'card',
      type: 'debit',
      amount: pounds(3500, 8000),
      party: 'ELECTRO HUB',
    })
  }
  if (random() < 0.3) {
    events.push({
      date: at(int(16, 28)),
      account: 'card',
      type: 'credit',
      amount: pounds(300, 900),
      party: 'URBAN THREADS REFUND',
    })
  }

  const totalWeight = CARD_MERCHANTS.reduce((sum, [, weight]) => sum + weight, 0)
  for (let n = int(22, 32); n > 0; n--) {
    let pick = random() * totalWeight
    const [merchant, , lo, hi] = CARD_MERCHANTS.find(([, weight]) => (pick -= weight) < 0)!
    events.push({ date: at(int(1, 28)), account: 'card', type: 'debit', amount: pounds(lo, hi), party: merchant })
  }
  return events
}

function smsText(account: Account, type: 'debit' | 'credit', amount: string, party: string, balance: number): string {
  const digits = DIGITS[account]
  if (account === 'card') {
    const limit = formatMinor(CARD_LIMIT + balance)
    return type === 'debit'
      ? `Your card ending *${digits} was charged EGP ${amount} at ${party}. Available limit EGP ${limit}`
      : `Card ending *${digits} credited with EGP ${amount} from ${party}. Available limit EGP ${limit}`
  }
  const currency = account === 'savings' ? 'USD' : 'EGP'
  return type === 'debit'
    ? `Account *${digits} debited ${currency} ${amount} for ${party}. Balance ${currency} ${formatMinor(balance)}`
    : `Account *${digits} credited with ${currency} ${amount} from ${party}. Balance ${currency} ${formatMinor(balance)}`
}

/** The demo SMS from the start of the month DEMO_MONTHS − 1 before `now` up to `now`, oldest first. */
export function demoLedger(now: Date): DemoMessage[] {
  const balances = { ...OPENING }
  const messages: DemoMessage[] = []
  let cardPayment = 0

  for (let back = DEMO_MONTHS - 1; back >= 0; back--) {
    const first = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const events = monthEvents(first.getFullYear(), first.getMonth()).sort((a, b) => +a.date - +b.date)
    const yearMonth = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`

    let last = 0
    for (const [i, e] of events.entries()) {
      // Distinct instants per message: the importer keeps the latest reported balance.
      const date = new Date(Math.max(+e.date, last + 60_000))
      last = +date
      if (date > now) break

      // Never zero: subscriptions on the 3rd and 8th always leave something owing.
      if (e.amount === null && e.account === 'checking') cardPayment = -balances.card
      const amount = e.amount ?? cardPayment
      balances[e.account] += e.type === 'debit' ? -amount : amount

      messages.push({
        sender: DEMO_SENDER,
        date,
        text: smsText(e.account, e.type, formatMinor(amount), e.party, balances[e.account]),
        guid: `${DEMO_GUID_PREFIX}${yearMonth}-${String(i + 1).padStart(3, '0')}`,
      })
    }
  }
  return messages
}
