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
| `backend/src/services/patterns/`, `services/ingest/decode.ts`, `services/ingest/parser.ts`, `services/learn-patterns.ts`, the pattern file format | `docs/PATTERNS.md`, `docs/PATTERNS-ALGORITHM.md` |
| `services/importer.ts`, `services/importer2.ts`, `services/ingest/balance.ts` | `docs/ARCHITECTURE.md`, `README.md` (*Architecture*, *Ledger correctness*), the importer table below |

## Monorepo layout

```
package.json  npm workspaces root — one `npm install` here, one package-lock.json
shared/     @wealthi/shared — the HTTP API contract, types only
backend/    Node + Express + Prisma 7 + Postgres
frontend/   React 19 (Vite) + React Router + TanStack Query + Tailwind v4
docker-compose.yml   Postgres 16 (container: wealthi_db)
e2e/        Playwright specs + stack.mjs (test DB, seed, API on :3100) — config in playwright.config.ts
.github/workflows/ci.yml   lint, typecheck, tests + coverage, Playwright; weekly mutation run
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
npm run dev             # nodemon + ts-node src/server.ts, imports the real chat.db
npm run patterns:learn  # src/services/learn-patterns.ts, reads the real chat.db

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

**The import runs only when the backend starts**: `src/server.ts` calls `importFromChatDb()` from
`services/importer.ts` in the `app.listen` callback (no endpoint, no npm script). If `chat.db` is
missing it is skipped and the server serves what is already in Postgres.

### importer.ts vs importer2.ts — know which one you are editing

| | `importer.ts` (**wired to the server**) | `importer2.ts` (not wired) |
|---|---|---|
| Cursor | none — reads **all** matching messages every run | reads from the `import_state` rowid cursor |
| Writes | **deletes all rows** in `transactions` + `monthly_balances`, then re-inserts | inserts new rows, upserts touched months |
| Months | re-inserts every transaction, but computes balances for the **last 6** months only (`.slice(-6)`) | recomputes from the earliest touched month forward |
| Opening balances | `config.openingBalances` seeds the first of those 6 months | `openingFor()` reads the prior month's closing from the DB |
| Manual / recurring entries | inserted into `transactions` **and** merged into the balance math | not merged |
| CSV entries | merged into the balance math, **not** inserted into `transactions` | not merged |

So the live path is a **destructive full rebuild of a rolling 6-month window**, and
`config.openingBalances` must be the balance at the **start of that window**, not at genesis — it
drifts as months roll over.

## Project structure

```
backend/src/
  routes/ → validation/ → services/ or db/   thin handlers; Zod schemas; logic; Prisma queries
  services/importer.ts, importer2.ts          live full-rebuild import; incremental import (not wired)
  services/learn-patterns.ts                  CLI behind npm run patterns:learn
  services/ingest/     pipeline steps: reader → decode → parser → transfer → balance
  services/patterns/   learn.ts (mask → mine → label); mine.ts is wired, mine2.ts (older LCS miner) is not
frontend/src/pages/<Name>Page/   <Name>Page.tsx + index.ts + its own components/
```

## Database

`backend/prisma/schema.prisma`, synced with `db push` (no migration history). `transactions` is the
source of truth; `monthly_balances` is a derived snapshot per `(year_month, account)`; `import_state`
is the `importer2.ts` cursor. Prisma 7 takes the URL from `backend/prisma.config.ts`, not
`schema.prisma`; the app builds its own `Pool` in `src/db/client.ts`.

`transactions.raw_text` holds the SMS body a row was parsed from (null for manual/CSV rows), for
the transaction detail modal and for diagnosing a mis-parse without `chat.db`. It is cleaned by
`sanitizeMessageText()` (`services/ingest/sanitize.ts`) on the way in — bidi marks, zero-width
characters, control bytes and odd spaces out — and **only on the stored copy**: the text handed to
the pattern matcher stays byte-exact, because patterns were learned against the bytes as they
arrive. It is served by `GET /api/transactions` like any other field.

## Private config

Everything personal lives in `backend/config/wealthi.json` (gitignored), validated at startup by the
Zod schema in `utils/config/schema.ts`; `wealthi.example.json` is the committed shape — update it
whenever the shape changes.

Two config errors are fatal, because neither can be repaired without inventing data: a duplicate
`accounts[].id`, and a declared account with no `openingBalances` entry. Everything else about
account cross-references is **pruned, not fatal** — deleting an account from `accounts` leaves
references behind in up to seven other keys, and `pruneUnknownAccounts()` drops them so the server
still starts. Each drop is printed to stderr at startup with what it cost: `tag only` (a
`transferRules` entry or a `csvImports[].counterAccount` — a transfer is a tag, so balances are
unaffected), `no longer imported` (an `accountSources` mapping, a manual/recurring entry, or a whole
`csvImports` entry — **these change balances**), or `none` (a dead `openingBalances` key). Learned patterns live in `backend/config/patterns/<bank>.json`. Config and
pattern files are read once, at module import: edits need a server restart.

Accounts are **not hardcoded**: `account`/`counter_account` hold ids from `accounts`. Patterns never
name an account — a match yields a source key `<bank>:<last4>` (e.g. `example-bank:1234`) that
`accountSources` maps to an account id. (The schema's `accountSources` comment still describes the
old per-parser keys; the key format here is the current one.)

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
- **Only enabled patterns parse.** Learn adds new patterns `"enabled": false` and never overwrites one
  you edited. No match is an error (`no enabled pattern matched`), never a guess.
- **Parse errors are collected, not thrown** (except an undecodable message — a known bug, see Tests).
  A foreign-currency charge on a local-currency account is `skipped` on purpose, not an error.
- **Merchant strings are exact.** Categories and transfer rules key on them; editing a pattern can
  silently break those keys.
- **Transfers are a tag, not a type**: a normal debit/credit with a `counterAccount`, set by
  `config.transferRules` — never by amount-and-date guessing.
- **Money is `Minor` (integer minor units, `utils/money.ts`).** Parse with `parseMinor`, never via a
  float; sums are integer; Prisma gets `minorToDecimal` strings; only API responses become numbers.
  `round2` is for percentages only.
- **Months are local wall-clock time**, not UTC: `year_month` is a `CHAR(7)` `"YYYY-MM"`.
- **Categories resolve in one place**: manual `category`, else `MERCHANT_CATEGORIES[merchant]`, else
  `"Uncategorized"`, always via `resolveCategory()`. Presentation-only: no balance recompute.
- **Routes hold no logic**: read the request, validate (Zod in `validation/`, or `isYearMonth` for a
  lone `yearMonth`), call a service or db function, map to status + JSON.
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
| `IMESSAGE_DB_PATH` | `data/chat.db` under the cwd (`backend/`) | chat.db for the import and `patterns:learn` |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated allowlist |
| `WEALTHI_CONFIG_PATH` / `WEALTHI_PATTERNS_DIR` | `backend/config/…` | config + pattern dir (tests point them at fixtures) |
| `TEST_DATABASE_URL` / `API_PROXY_TARGET` | — | test-only, see `docs/TESTING.md` |

## Security posture

The API serves your whole financial history with **no authentication**. Don't widen these defaults:
Postgres published on `127.0.0.1` only (its default password is public), the API bound to `127.0.0.1`,
CORS an explicit allowlist (never `*`), `chat.db` opened read-only.
