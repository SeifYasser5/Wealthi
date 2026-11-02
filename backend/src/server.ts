import 'dotenv/config'
import app from './app'
import { seedCategories } from './db/categories'
import { seedManualTransactions } from './db/manual-transactions'
import { seedSchedules } from './db/schedules'
import { seedSettings } from './db/settings'
import { seedDemo } from './demo/seed'
import { config } from './utils/config'

const PORT = process.env.PORT || 3000

// Loopback by default: the API is unauthenticated, so binding every interface
// would expose your transactions to the whole network. Set HOST to widen it.
const HOST = process.env.HOST ?? '127.0.0.1'

// Starting the server never imports: the import is a destructive rebuild, so it
// runs only when asked, from Settings (POST /api/import).
function listen(): void {
  app.listen(Number(PORT), HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`)
  })
}

// The public demo (see Dockerfile) rebuilds its synthetic ledger before it
// listens, so the first visitor never sees an empty page, and exits if it
// can't: a demo with no data is a failed deploy, not something to serve.
if (process.env.WEALTHI_DEMO === 'true') {
  seedDemo()
    .then(({ months, totalStored, errors }) => {
      console.log(`[demo] Seeded ${totalStored} transactions over ${months} months, ${errors.length} parse errors.`)
      listen()
    })
    .catch((err: unknown) => {
      console.error('[demo] Seed failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    })
} else {
  // Settings (accounts, sources, transfer rules, senders), categories, schedules and manual transactions live in the
  // database. The first start that finds none fills them from config (accounts, accountSources, openingBalances,
  // transferRules, bankSenders; merchantCategories and extraCategories; recurringTransactions; manualTransactions);
  // later ones leave the pages' edits alone. A failed
  // seed is reported, not fatal: every other page still works, and the next
  // start tries again.
  seedSettings(config)
    .then((seeded) => {
      if (seeded > 0) console.log(`Seeded ${seeded} account, source, transfer rule and sender rows from config.`)
    })
    .catch((err: unknown) => {
      console.error('Settings seed failed:', err instanceof Error ? err.message : err)
    })
    .then(() => seedCategories(config))
    .then((seeded) => {
      if (seeded > 0) console.log(`Seeded ${seeded} categories from config.`)
    })
    .catch((err: unknown) => {
      console.error('Category seed failed:', err instanceof Error ? err.message : err)
    })
    .then(() => seedSchedules(config.recurringTransactions))
    .then((seeded) => {
      if (seeded > 0) console.log(`Seeded ${seeded} schedules from config.`)
    })
    .catch((err: unknown) => {
      console.error('Schedule seed failed:', err instanceof Error ? err.message : err)
    })
    .then(() => seedManualTransactions(config.manualTransactions))
    .then((seeded) => {
      if (seeded > 0) console.log(`Seeded ${seeded} manual transactions from config.`)
    })
    .catch((err: unknown) => {
      console.error('Manual transaction seed failed:', err instanceof Error ? err.message : err)
    })
    .finally(listen)
}
