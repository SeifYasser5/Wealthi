# Testing

**Layers**
- Backend unit: `backend/test/unit/`. No DB; db modules are mocked (`routes.test.ts`).
- Backend integration: `backend/test/integration/`. Real Postgres, importers, the API through Supertest.
- Frontend: `frontend/test/{unit,pages}/`. Vitest + jsdom + RTL + MSW.
- Browser e2e: `e2e/*.spec.ts`. Playwright over the real stack. **This is the highest layer, and the default.**

**Run**
- e2e: `npm run test:e2e -- e2e/ledger.spec.ts` from the root. Needs Docker, or `TEST_DATABASE_URL` pointing at a `*_test` DB (`e2e/stack.mjs`).
- Backend: from `backend/`, `npx vitest run --project integration test/integration/api.test.ts` (Docker or `TEST_DATABASE_URL`) or `--project unit`.
- Frontend: from `frontend/`, `npx vitest run test/pages/spending.test.tsx`.
- Prisma client first: `npx prisma generate` in `backend/` (`.github/workflows/ci.yml`). The schema is pushed for you (`test/setup/postgres.ts`, `e2e/stack.mjs`). No `.env` needed.

**Harness**
- e2e: `playwright.config.ts` starts `e2e/stack.mjs` (container → `prisma db push` → `backend/test/e2e/seed.ts` → `ts-node src/server.ts` on :3100) and Vite on :5174 proxying `/api` (`API_PROXY_TARGET`). Use `page.goto('/transactions?yearMonth=2026-01')`, or the `request` fixture for API calls.
- Integration: `request(app)` from `supertest` against `src/app`, with no listening port (`test/integration/api.test.ts`). `test/setup/postgres.ts` provides the DB URL, and `test/setup/database-url.ts` sets it before `src/` loads.
- Frontend: `renderApp(url)` / `renderWithProviders(ui, url)` return `{ user }`, and `currentUrl()` reads the router (`frontend/test/render.tsx`).
- Seed: `backend/test/e2e/seed.ts` runs through `test/e2e/tsconfig.json`, because ts-node only compiles files inside its tsconfig.
- Mutation: `npm run test:mutation` (`backend/stryker.config.mjs`) uses Stryker's *command* runner over the unit project only (`vitest.stryker.config.mts`). `@stryker-mutator/vitest-runner` never activates mutants under Vitest 5. `ignorePatterns` keeps `data/` and the private `config/` out of Stryker's sandbox copy; keep it that way.
- Test files are linted, formatted and type-checked (`backend/test/tsconfig.json`, `frontend/tsconfig.test.json`).

**Data**
- Ledger: `backend/test/fixtures/messages.ts` (`LEDGER`, expected balances at the top; sender `Test Bank`, bank id `test-bank`), turned into a chat.db by `buildChatDb()` / `appendMessages()` in `fixtures/chat-db.ts`, which also encodes streamtyped `attributedBody` blobs.
- Config and patterns: `fixtures/wealthi.test.json` and `fixtures/patterns/`, wired through `WEALTHI_CONFIG_PATH` / `WEALTHI_PATTERNS_DIR` in `backend/vitest.config.mts`, so no test reads your config, patterns or `chat.db`. `wealthi.full.json` and `fixtures/csv/` cover the balance-window tests.
- Modules that read config at import (`manual-transactions`, `config/index`): `vi.resetModules()` + `vi.stubEnv('WEALTHI_CONFIG_PATH', …)` (`backend/test/unit/config.test.ts`).
- Reset: integration files call `resetDatabase()` (`test/setup/reset.ts`) and then import `LEDGER`, and files run serially (`fileParallelism: false`). e2e shares one seeded DB, so a test that writes restores the data in `afterEach` (`e2e/spending.spec.ts`).
- Frontend: `frontend/test/fixtures.ts` holds the data, and `api.reset()` in `test/setup.ts` re-clones it before each test.

**Auth**: none. The API is unauthenticated (AGENTS.md, Security posture).

**Boundaries**
- HTTP (frontend): MSW `setupServer` with `onUnhandledRequest: 'error'` (`frontend/test/server.ts`, `test/setup.ts`). `api.queries(path)` returns the query strings that were sent.
- Modules: `vi.mock` (`backend/test/unit/routes.test.ts`, `server.test.ts`).
- Clock: `vi.useFakeTimers({ toFake: ['Date'], now })` (`test/integration/importer-window.test.ts`). `TZ=UTC` is pinned in both vitest configs, and Playwright pins `timezoneId: 'UTC'` and `locale: 'en-US'`.

**Assertions**
- Vitest `expect`. Supertest `.expect(200)`, then `res.body`. Rows through `prisma.transaction.findMany` / `findFirstOrThrow` (`test/integration/pipeline.test.ts`).
- Frontend and e2e: role/text queries, `toBeVisible`, `toHaveText`, `toHaveURL`. Known bugs are pinned with `it.fails` (`test/unit/balance.test.ts`). There are no snapshots.

**Naming**
- `e2e/<area>.spec.ts`: `test.describe("transactions")`, `test("filters narrow the list and live in the URL")`.
- `backend/test/{unit,integration}/<module>.test.ts`: `describe('GET /api/transactions')`, `it('filters by month and account, newest first')`.

**Avoid**
- Any DB whose name doesn't end in `_test`, which `test/setup/guard.ts` and `e2e/stack.mjs` refuse. Also avoid `--force-reset` (`test/setup/postgres.ts`).
- Real `chat.db`, config or patterns. Use the fixtures only; e2e points `IMESSAGE_DB_PATH` at `test/e2e/no-chat.db`.
- Unhandled network (MSW errors on it), parallel e2e (`workers: 1`), `test.only` in CI (`forbidOnly`), `waitForTimeout`.
- Lowering the coverage thresholds (`backend/vitest.config.mts`; the frontend's is 100%).
