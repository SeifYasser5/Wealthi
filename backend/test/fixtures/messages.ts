import { streamtypedBody, type FixtureMessage } from './chat-db'

/**
 * A synthetic two-month ledger for Test Bank (see fixtures/wealthi.test.json and
 * fixtures/patterns/test-bank.json). Dates are noon UTC; the suite runs with
 * TZ=UTC so each lands in the month it reads as.
 *
 * Expected outcome of importing it:
 *   2026-01  checking  1000 +5000 −250 (card payment)              = 5750
 *            card      0 −250 (ACME) +250 (card payment, transfer)  = 0
 *   2026-02  checking  5750 +1200 (attributedBody only)            = 6950
 *            card      0 −100 (ACME) −40 (CITY CAFE, uncategorized)  = −140
 * plus a USD charge on an EGP account (skipped, not an error), an OTP and an
 * unmapped card (both parse errors), and another sender's message (ignored).
 */

/** A noon-UTC Date for "YYYY-MM-DD". */
export const at = (iso: string) => new Date(`${iso}T12:00:00Z`)

export const BANK = 'Test Bank'

export const LEDGER: FixtureMessage[] = [
  {
    sender: BANK,
    date: at('2026-01-10'),
    text: 'Your card ending *2222 was charged EGP 250.00 at ACME GROCERS. Available balance EGP 4,750.00',
  },
  {
    sender: BANK,
    date: at('2026-01-15'),
    text: 'Account *1111 credited with EGP 5,000.00 from EMPLOYER LTD. Balance EGP 6,000.00',
  },
  {
    sender: BANK,
    date: at('2026-01-20'),
    text: 'Account *1111 debited EGP 250.00 for CARD PAYMENT. Balance EGP 5,750.00',
  },
  {
    sender: BANK,
    date: at('2026-01-20'),
    text: 'Account *2222 credited with EGP 250.00 from CARD PAYMENT. Balance EGP 5,000.00',
  },
  {
    sender: BANK,
    date: at('2026-02-01'),
    attributedBody: streamtypedBody('Account *1111 credited with EGP 1,200.00 from EMPLOYER LTD. Balance EGP 6,950.00'),
  },
  {
    sender: BANK,
    date: at('2026-02-03'),
    text: 'Your card ending *2222 was charged EGP 100.00 at ACME GROCERS. Available balance EGP 4,900.00',
  },
  // No merchantCategories entry, so it lands in Uncategorized
  {
    sender: BANK,
    date: at('2026-02-04'),
    text: 'Your card ending *2222 was charged EGP 40.00 at CITY CAFE. Available balance EGP 4,860.00',
  },
  // Skipped: a USD amount on an EGP account
  {
    sender: BANK,
    date: at('2026-02-05'),
    text: 'Your card ending *1111 was charged USD 20.00 at ONLINE STORE. Available balance EGP 6,950.00',
  },
  // Errors: not a transaction / an account nobody mapped
  { sender: BANK, date: at('2026-02-06'), text: 'Your one-time password is 482913. Do not share it.' },
  {
    sender: BANK,
    date: at('2026-02-07'),
    text: 'Your card ending *9999 was charged EGP 10.00 at ACME GROCERS. Available balance EGP 90.00',
  },
  // Only a disabled pattern matches this — must be an error, never a transaction
  { sender: BANK, date: at('2026-02-08'), text: 'Cash withdrawal of EGP 300.00 from *1111' },
  // Not a bank sender — never read
  { sender: '+15550000000', date: at('2026-02-09'), text: 'See you at 7?' },
]
