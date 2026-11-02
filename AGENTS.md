# Wealthi — AGENTS.md

## What this project does

Wealthi parses bank SMS notifications (delivered as iMessages) into a structured financial ledger.
The pipeline reads `chat.db`, decodes the message text, matches it against **learned per-bank
patterns**, classifies internal transfers, and materializes monthly balance snapshots into Postgres.
The frontend is a thin React reader over the read API.

## Docs

- [`README.md`](README.md): setup and running the app (human-only)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): why the pipeline is shaped the way it is
- [`docs/PATTERNS.md`](docs/PATTERNS.md) (brief, adding a bank) and [`docs/PATTERNS-ALGORITHM.md`](docs/PATTERNS-ALGORITHM.md) (full algorithm)
- [`docs/TESTING.md`](docs/TESTING.md): test layers, running one file, fixtures, stubbing, naming

**Update docs in the same change:**

| When you change | Update |
|---|---|
| `backend/src/services/patterns/`, `services/ingest/decode.ts`, `services/ingest/parser.ts`, `services/learn-patterns.ts`, `services/run-learn.ts`, `db/patterns.ts`, the `sms_patterns` model or seed pattern file format | `docs/PATTERNS.md`, `docs/PATTERNS-ALGORITHM.md` |
| `services/importer.ts`, `services/importer2.ts`, `services/ingest/balance.ts` | `docs/ARCHITECTURE.md`, `README.md` (*Architecture*, *Ledger correctness*), the importer table below |
| `backend/src/demo/`, `backend/demo/`, `Dockerfile`, `railway.json` | `README.md` (*Live demo*, *Deploying the demo*), *Demo deployment* below |
| `db/accounts.ts`, `db/transfer-rules.ts`, `db/bank-senders.ts`, `db/settings.ts`, the settings models, the four settings routes | `README.md` (*Settings*), *Settings* below |

## Monorepo layout

```
package.json  npm workspaces root — one `npm install` here, one package-lock.json
shared/     @wealthi/shared — the HTTP API contract, types only
backend/    Node + Express + Prisma 7 + Postgres
frontend/   React 19 (Vite) + React Router + TanStack Query + Tailwind v4
docker-compose.yml   Postgres 16 (container: wealthi_db)
e2e/        Playwright specs + stack.mjs (test DB, seed, API on :3100) — config in playwright.config.ts
.github/workflows/ci.yml   lint, typecheck, tests + coverage, Playwright; weekly mutation run
Dockerfile, railway.json   the public demo on Railway: synthetic data only (see Demo deployment)
```

Install from the root on Node 22 with **npm 11+** (npm 10's arborist crashes on this tree):
`nvm use 22 && npx npm@11 install`. Deps and the Prisma client are hoisted to the root `node_modules`.
`allowScripts` in the root `package.json` approves only Prisma's install scripts; when a new
dependency's script is skipped, review it with `npx npm@11 install-scripts ls` and approve or deny it.

**Shared types** (`shared/src/index.ts`): types only, wire shape (`import type`, ISO date strings).
Backend modules import them via `backend/src/utils/types.ts`, the frontend from `@wealthi/shared`.
Routes annotate payloads with the shared response type so drift fails `tsc` (the transactions
routes can't yet: they send `Date`-typed domain rows).

## Commands

```bash
# Backend (run from backend/)
npx prisma generate     # once after install, and before any test run
npm run build
npm run typecheck       # src + prisma.config.ts, then test/
npm run lint
npm run format          # prettier --write src + test
npm run format:check
npm test                # vitest: unit + integration (integration needs Docker) — see Tests
npm run test:unit       # no DB; test:integration for Docker/Postgres only
npm run test:coverage   # both, failing under the thresholds in vitest.config.mts
npm run test:mutation   # Stryker over the pure logic (~20 min); report in reports/mutation/
# Human-only, never run by agents (real DB or real chat.db):
npm run db:push         # sync schema (no migration history); db:migrate and db:studio likewise
npm run dev             # nodemon + ts-node src/server.ts; its Settings imports and its Settings → Learn
                        # learns from the real chat.db

# Frontend (run from frontend/)
npm run lint
npm run build           # tsc -b && vite build — this is the frontend typecheck
npm test                # vitest + React Testing Library + MSW
npm run test:coverage   # threshold is 100%

# Shared (run from shared/)
npm run typecheck

# Root
npm run typecheck:e2e
npm run test:e2e        # Playwright over a seeded test stack
```

CI gate, in order: backend `lint`, `format:check`, `typecheck`, `test:coverage`; frontend `lint`,
`build`, `test:coverage`; root `typecheck:e2e`, `test:e2e`.

## Running an import

**The import runs only when asked**, from the frontend's Settings page (Import section): its button calls
`POST /api/import` (`routes/import.ts`) → `runImport()` (`services/run-import.ts`) →
`importFromChatDb()` from `services/importer.ts`. Starting the server never imports. The request
stays open until the import finishes and answers with an `ImportResponse` report (status, months,
transactions stored, each parse error with its reason); a failure is a 500 carrying the reason.
Only one import runs at a time: a call made while one is in progress joins it and gets the same
report. If `chat.db` is missing the report says `skipped` and Postgres is left as it was. In demo
mode (`WEALTHI_DEMO=true`) `chat.db` is never read: the server runs `seedDemo()` before it listens,
and an import from Settings runs `seedDemo()` again.

### importer.ts vs importer2.ts — know which one you are editing

| | `importer.ts` (**wired to `POST /api/import`**) | `importer2.ts` (not wired) |
|---|---|---|
| Cursor | none — reads **all** matching messages every run | reads from the `import_state` rowid cursor |
| Writes | **deletes all rows** in `transactions` + `monthly_balances`, then re-inserts | inserts new rows, upserts touched months |
| Months | re-inserts every transaction, but computes balances for the **last 6** months only (`.slice(-6)`) | recomputes from the earliest touched month forward |
| Opening balances | each account's `opening_balance` (the `accounts` table) seeds the first of those 6 months | `openingFor()` reads the prior month's closing from the DB, else the accounts' opening balances |
| Manual transactions, schedules | inserted into `transactions` **and** merged into the balance math (the `manual_transactions` rows; each schedule's occurrences through today, marked with `schedule_id`) | not merged |
| CSV entries | merged into the balance math, **not** inserted into `transactions` | not merged |

So the live path is a **destructive full rebuild of a rolling 6-month window**, and
each account's opening balance must be the balance at the **start of that window**, not at genesis — it
drifts as months roll over.

## Learning patterns

**Learning also runs only when asked**, from the frontend's Settings → Learn: **Learn patterns** calls
`POST /api/patterns/learn` (`routes/patterns.ts`) → `runLearn()` (`services/run-learn.ts`) →
`learnFromChatDb()` (`services/learn-patterns.ts`), which stores every pattern it finds that
`sms_patterns` doesn't hold yet as `pending` and answers with a `LearnResponse` (`added: 0` is the
page's *Nothing new found*). The page lists the pending ones for review; confirming sends
`PATCH /api/patterns` with the ticked ids in `enable` and the rest in `disable`. Enabled and Disabled
tabs list the reviewed patterns, each with a toggle. Pattern text is read-only in the UI. One learn runs
at a time, like the import. The table starts empty, so a fresh install parses nothing until patterns are
learned and enabled. Like the import, a learn reads the real `chat.db`: human-only.

## Project structure

```
backend/src/
  routes/ → validation/ → services/ or db/   thin handlers; Zod schemas; logic; Prisma queries
  services/importer.ts, importer2.ts          live full-rebuild import; incremental import (not wired)
  services/run-import.ts                      POST /api/import: one run at a time, its report
  services/learn-patterns.ts, run-learn.ts    learn from chat.db into sms_patterns; POST /api/patterns/learn: one run at a time
  services/ingest/     pipeline steps: reader → decode → parser → transfer → balance
  services/patterns/   learn.ts (mask → mine → label); mine.ts is wired, mine2.ts (older LCS miner) is not
  db/patterns.ts       sms_patterns: store a learn run, list, set status, enabled rows for the parser, seed files
  db/categories.ts     categories + merchant_categories: CRUD, reorder, merchant map, the seed from config
  db/schedules.ts      schedules: CRUD, the rows the import expands, the seed from config
  db/accounts.ts, db/transfer-rules.ts, db/bank-senders.ts   the Settings tables: CRUD, what the import loads
  db/settings.ts       loadIngestSettings() (one snapshot per import/learn), the seed from config, the demo's replace
  utils/helpers/schedule.ts   when a schedule's occurrences fall, and the transactions they become
  demo/                ledger.ts (synthetic SMS, dated relative to now); seed.ts (demo mode's import)
backend/demo/          the demo's committed config + seed pattern file — synthetic, safe to read and edit
frontend/src/pages/<Name>Page/   <Name>Page.tsx + index.ts + its own components/
frontend/src/utils/insights.ts   the Insights page's engine: a `View` (measure, grouping, split, period) → chart data, pure
```

## Database

`backend/prisma/schema.prisma`, synced with `db push` (no migration history). `transactions` is the
source of truth; `monthly_balances` is a derived snapshot per `(year_month, account)`; `import_state`
is the `importer2.ts` cursor; `sms_patterns` holds the learned patterns with a
`pending`/`enabled`/`disabled` status (see *Learning patterns*); `categories` and `merchant_categories`
hold the categories and the merchant map (see *Categories*); `schedules` holds the repeating
transactions (see *Schedules*); `manual_transactions` holds the one-off hand-entered ones (see *Manual transactions*); `accounts`, `account_sources`, `transfer_rules` and `bank_senders` hold the
settings the import reads (see *Settings*). Prisma 7 takes the URL from `backend/prisma.config.ts`, not
`schema.prisma`; the app builds its own `Pool` in `src/db/client.ts`.

`transactions.raw_text` holds the SMS body a row was parsed from (null for manual/CSV rows), for
the transaction detail modal and for diagnosing a mis-parse without `chat.db`. It is cleaned by
`sanitizeMessageText()` (`services/ingest/sanitize.ts`) on the way in — bidi marks, zero-width
characters, control bytes and odd spaces out — and **only on the stored copy**: the text handed to
the pattern matcher stays byte-exact, because patterns were learned against the bytes as they
arrive. It is served by `GET /api/transactions` like any other field.

## Categories

Categories are rows in `categories` (`name` unique, `position` the order every list shows), edited on
the frontend's Categories page through `/api/categories` (`routes/categories.ts` → `db/categories.ts`).
`transactions.category_id` (a manual assignment), `schedules.category_id` and
`merchant_categories.category_id` (the merchant map, edited through `PUT /api/merchant-categories`) are
**foreign keys with `ON DELETE RESTRICT`**, so the database itself refuses a category id that isn't
stored, on every insert path, and refuses to delete one still in use. The API turns those into a 400
(unknown id) and a 409 (in use, with the counts the page shows); the API also refuses a name that differs
from another only in case, and `Uncategorized`, which is the bucket, not a category. Categories are not
config: the first start that finds the table empty (`seedCategories()` in `server.ts`) fills it from
config's `merchantCategories` and `extraCategories`; later starts never read them again. `seedDemo()`
replaces them with the demo config's on every seed.

## Schedules

A schedule is a transaction that repeats without an SMS (rent, a subscription), a row in `schedules`
edited on the frontend's Schedules page through `/api/schedules` (`routes/schedules.ts` →
`db/schedules.ts`): direction, amount, account (the currency is the account's), merchant, an optional
category, `frequency` (`daily`/`weekly`/`monthly`/`yearly`) every `interval` units, `start_date` and an
optional `end_date`. **Occurrences are not stored by the page, only by the import**: every
`importFromChatDb()` expands each schedule (`stageSchedules()` in `utils/helpers/schedule.ts`) into one
row per occurrence from the start date through **today**, local time, and never past the end date, each
with `transactions.schedule_id` set. So a new, edited or deleted schedule reaches the ledger at the next
import, and an edit rewrites past occurrences too: to change an amount from some date on, end the
schedule and start another. Deleting one sets its rows' `schedule_id` null (`ON DELETE SET NULL`) and
leaves them, so balances still match the rows, until the next import leaves them out. Monthly and
yearly occurrences are counted from the start date each time: the 31st clamps to a shorter month's last
day and is back on the 31st the month after. Config's `recurringTransactions` is **seed-only**: the
first start that finds the table empty (`seedSchedules()` in `server.ts`) stores each entry as a monthly
schedule. As with categories, emptying the table makes the next start seed it again, so remove the key
once it has been seeded.

The Schedules page also **suggests** schedules (`GET /api/schedules/suggestions` →
`services/schedule-suggestions.ts`), like the Categories page suggests categories: per
(merchant, direction, currency), non-transfer transactions that no schedule made, where at least 3
months have exactly one transaction and those are at least 75% of the months it appears in. The amount
and the account may differ each month; the panel shows the accounts used and the min–max spread.
Merchants already on a schedule are left out. *Schedule* opens the new-schedule form filled in, starting
**next month**, because an occurrence from the first SMS would double what the ledger already holds.

## Manual transactions

A manual transaction is a one-off entry with no SMS (a bank fee, a reversal, an adjustment): a row in
`manual_transactions` (type, amount, account, merchant, optional category, date), edited on the
frontend's Settings page (Manual section) through `/api/manual-transactions` (`routes/manual-transactions.ts` →
`db/manual-transactions.ts`). They live in their own table because every import rebuilds `transactions`
from scratch: `importFromChatDb()` loads them (`loadManualTransactions()`), stages them
(`stageManualTransactions()` in `utils/helpers/manual-transactions.ts`) and inserts a copy next to the SMS
rows, counted in the balances, so none is lost to a re-import. A new, edited or deleted one reaches the
ledger at the next import. Config's `manualTransactions` is **seed-only** and the file is never changed:
the first start that finds the table empty (`seedManualTransactions()` in `server.ts`) copies each entry in,
and `seedDemo()` replaces the table with the demo config's. Like schedules, remove the key once seeded, or
emptying the table makes the next start copy it again.

## Settings

Accounts, source keys, transfer rules and bank senders are rows, edited on the frontend's Settings page
(four tabs) through `/api/accounts`, `/api/account-sources`, `/api/transfer-rules` and `/api/bank-senders`
(each `routes/` file → `validation/settings.ts` → `db/accounts.ts`, `db/transfer-rules.ts`,
`db/bank-senders.ts`). `accounts` holds `id` (what every ledger row stores), `label`, `currency` and
`opening_balance`; the id and currency can't be edited once saved. `account_sources.account_id` and both
`transfer_rules` account columns are **foreign keys with `ON DELETE RESTRICT`**, so an unknown account id is
refused by the database (a 400). The older tables' `account` columns (`transactions`, `schedules`,
`manual_transactions`, `monthly_balances`) are plain text with no foreign key, so `deleteAccount()` counts
what names an account (those, sources, rules and config's `csvImports`) and refuses with a 409 listing them.
A transfer rule's empty `merchant` means any merchant; `(account, type, merchant)` is unique and the import
tries a rule with a merchant before the catch-alls.

The import and learn read these **once at their start** with `loadIngestSettings()` (`db/settings.ts`) and
pass the snapshot down: `createPatternParser(files, settings)` (accounts and sources),
`classifyTransfer(tx, rules)`, `readMessages(path, senders)` and the opening balances of
`recomputeBalances` / `openingFor`. Nothing reads these from config at run time, and the validators that need
the account list (`parseScheduleRequest`, `parseManualTransactionRequest`, `parseTransactionFilters`) take
it as a parameter, fetched by the route. Config's `accounts`, `openingBalances`, `accountSources`,
`transferRules` and `bankSenders` are **seed-only**: the first start that finds each table empty
(`seedSettings()` in `server.ts`, accounts first) stores them, later starts never read them again, and
emptying a table makes the next start seed it again, so remove the keys once seeded. `seedDemo()`
replaces all four tables with the demo config's (`replaceSettings()`). `csvImports` is still live config.

## Private config

Everything personal starts in `backend/config/wealthi.json` (gitignored), validated at startup by the
Zod schema in `utils/config/schema.ts`; `wealthi.example.json` is the committed shape — update it
whenever the shape changes. Most of it is seed-only (see *Settings*, *Categories*, *Schedules*, *Manual
transactions*); what is read live is `csvImports`.

Two config errors are fatal, because neither can be repaired without inventing data: a duplicate
`accounts[].id`, and a declared account with no `openingBalances` entry. Everything else about
account cross-references is **pruned, not fatal** — deleting an account from `accounts` leaves
references behind in up to seven other keys, and `pruneUnknownAccounts()` drops them so the server
still starts. Each drop is printed to stderr at startup with what it cost: `tag only` (a
`transferRules` entry or a `csvImports[].counterAccount` — a transfer is a tag, so balances are
unaffected), `no longer imported` (an `accountSources` mapping, a manual entry, a recurring entry not
yet seeded into `schedules`, or a whole
`csvImports` entry — **these change balances**), or `none` (a dead `openingBalances` key). With no
`accounts` in the file (the key removed once seeded) nothing is checked or pruned. Config is
read once, at module import: edits need a server restart. Learned patterns are not config: they live
in the `sms_patterns` table and each import reads the enabled ones afresh. Any `backend/config/patterns/`
left from before is no longer read.

Accounts are **not hardcoded**: `account`/`counter_account` hold ids from the `accounts` table. Patterns
never name an account — a match yields a source key `<bank>:<last4>` (e.g. `example-bank:1234`) that
the `account_sources` table maps to an account id.

## Key design rules

- **Agents never touch real data.** Never open, print or modify anything under `backend/data/` or
  `backend/config/` except `wealthi.example.json`, and never run the human-only commands above.
  Setup ([`README.md`](README.md) → *Running it*) and adding a bank ([`docs/PATTERNS.md`](docs/PATTERNS.md)
  → *Day-to-day workflow*) are human-only. Use `backend/test/fixtures/` and the tests.
- **Personal data stays out of git.** No account ids, card digits, real names, balances, merchants or
  real SMS text in source, fixtures, tests or committed docs.
- **`transactions` is the only source of truth.** Never edit `monthly_balances` directly; balances
  are rebuilt only by the import (unexported `recomputeBalances` → `computeBalance` per account per
  month). Closing of month N is opening of N+1. In tests, drive it through the integration suites.
- **Import writes are atomic.** Every write goes through the `db` client `prisma.$transaction` passes
  in (`createAllTransactions`, `upsertAllBalances`), never the global `prisma`. `importer2.ts` moves
  the cursor in that same transaction, so it never runs ahead of the rows it covers.
- **Only enabled patterns parse.** Learn adds new patterns `pending` and never changes the status or
  text of one already stored; only the Settings → Learn review or toggle (`PATCH /api/patterns`) sets a
  status. No match is an error (`no enabled pattern matched`), never a guess.
- **Parse errors are collected, not thrown** (except an undecodable message — a known bug, see Tests).
  A foreign-currency charge on a local-currency account is `skipped` on purpose, not an error.
- **Merchant strings are exact.** `merchant_categories` and transfer rules key on them; editing a pattern
  can silently break those keys.
- **Transfers are a tag, not a type**: a normal debit/credit with a `counterAccount`, set by
  the `transfer_rules` table — never by amount-and-date guessing.
- **Money is `Minor` (integer minor units, `utils/money.ts`).** Parse with `parseMinor`, never via a
  float; sums are integer; Prisma gets `minorToDecimal` strings; only API responses become numbers.
  `round2` is for percentages only.
- **Months are local wall-clock time**, not UTC: `year_month` is a `CHAR(7)` `"YYYY-MM"`.
- **Categories resolve in one place**: manual `category`, else the `merchant_categories` map
  (`loadMerchantCategories()`), else `"Uncategorized"`, always via `resolveCategory()`.
  Presentation-only: no balance recompute. A category is referenced by id, never by name (see *Categories*).
- **Routes hold no logic**: read the request, validate (Zod in `validation/`, or `isYearMonth` for a
  lone `yearMonth`), call a service or db function, map to status + JSON.
- **Pages scroll inside, never as a whole.** From `md` up a page is exactly the viewport under the NavBar:
  the root is `md:flex md:h-[calc(100dvh-4rem-1px)] md:flex-col` (4rem NavBar + 1px border), the header
  and any forms are `shrink-0`, and only the list/table is the scroll area (`min-h-0 overflow-y-auto`,
  with `flex-1 min-h-0` on every flex ancestor in between; table headers are `sticky top-0`). The title,
  filters and add-forms must never scroll away. Reference: `TransactionsPage`, `SpendingPage`,
  `CategoriesPage`, `SchedulesPage`, `SettingsPage`. Every new page with a growing list follows this.
- **Styling comes from `frontend/src/styles/theme.css` tokens.** Tailwind's palette is off: no hex, no
  `text-blue-500`, no `bg-primary/10` (tints are tokens: `bg-primary-soft`), no `opacity-*` for
  states, no `@apply` (repeated classes become a component in `components/`).

## Tests

Harness, fixtures, stubbing, naming, the `_test` database guard and coverage rules:
[`docs/TESTING.md`](docs/TESTING.md). All test data is **synthetic**. Never lower a coverage threshold
or the 90% mutation break to make a change pass; add a test that pins the behaviour instead.

**Known bugs pinned as `it.fails`** (remove `.fails` once fixed — the test will then pass for real):
- `ingest/balance.ts`: `if (false) transfersOut += …` counts outgoing transfers as debits.
- `importer.ts` / `importer2.ts`: an undecodable message (`DecodeError`) aborts the whole import.
- `importer2.ts`: re-reading an already-imported message (a reset cursor, a VACUUMed chat.db) hits the
  unique `message_guid` constraint and aborts the import instead of skipping the message.
- `patterns/mine.ts` + `label.ts`: single-word merchants can split off into a `by-keyword` pattern with
  the merchant baked in as literal text.
- `patterns/mine.ts`: a template where two things vary independently (a merchant *and* a note) can't be
  expressed — one template per message, both values baked in (`mine2.ts` handles it; `docs/PATTERNS-ALGORITHM.md` §11).

## Environment

The backend reads `backend/.env` (no committed example). Only `DATABASE_URL` is required.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | API bind address |
| `IMESSAGE_DB_PATH` | `data/chat.db` under the cwd (`backend/`) | chat.db for the import and learn |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated allowlist |
| `WEALTHI_CONFIG_PATH` | `backend/config/wealthi.json` | config (tests point it at fixtures) |
| `TEST_DATABASE_URL` / `API_PROXY_TARGET` | — | test-only, see `docs/TESTING.md` |
| `WEALTHI_DEMO` / `WEALTHI_STATIC_DIR` | unset | demo mode; serve the built frontend from this dir — set by the `Dockerfile` only |

## Security posture

The API serves your whole financial history with **no authentication**. Don't widen these defaults:
Postgres published on `127.0.0.1` only (its default password is public), the API bound to `127.0.0.1`,
CORS an explicit allowlist (never `*`), `chat.db` opened read-only.

## Demo deployment

The public demo (README → *Live demo*) is the `Dockerfile`, deployed to Railway by `railway.json`. It
sets `WEALTHI_DEMO=true`, points config at `backend/demo/`, binds `0.0.0.0` and serves
`frontend/dist` from Express, so the security defaults above are widened **only in that image**, which
holds synthetic data only. `.dockerignore` keeps `backend/config/` and `backend/data/` out of it.

On start the container runs `prisma db push`, then `seedDemo()` (`src/demo/seed.ts`): it replaces
`sms_patterns` with `backend/demo/patterns/`, the accounts, sources, transfer rules and senders and the categories with the demo config's and the schedules
with `demoSchedules(now)` (one subscription), the manual transactions with `demoManualTransactions(now)` (`src/demo/extras.ts`, dated relative to now, all on the credit card so no reconciled month gains a discrepancy), `demoLedger(now)` writes six months of made-up SMS to a
throwaway `chat.db`, and the live `importer.ts` rebuilds the database from it — so every restart (and
every import from Settings) resets the demo, including category edits, schedules and pattern toggles. A learn
from the demo's Settings → Learn reads the same ledger and finds nothing new. `seedDemo()` refuses to run
unless the config is `backend/demo/`'s, every stored SMS row has a `demo-` guid and every stored pattern
is `demo-bank`'s. `DEMO_SENDER` (`Demo Bank`) must slug to that bank: the parser finds patterns by `bankOf(sender)`.

`backend/demo/wealthi.demo.json` also carries one CSV import (`backend/demo/card-rewards.csv`, a monthly cashback on the card). It, `src/demo/extras.ts` and `src/demo/ledger.ts` must agree: opening balances (`OPENING`),
merchant strings (categories, transfer rules) and card digits. `backend/demo/patterns/demo-bank.json`
is `learnBank()`'s output over the demo SMS, enabled, with the card's available limit unlabelled;
`test/unit/demo.test.ts` fails if a ledger change makes learn mine something else, and
`test/integration/demo.test.ts` fails on any parse error or non-zero discrepancy.
