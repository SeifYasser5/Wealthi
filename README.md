# Wealthi

Wealthi turns bank SMS notifications, as they arrive in the macOS Messages database (`chat.db`), into a structured ledger in Postgres: one row per transaction, internal transfers tagged, monthly balance snapshots reconciled against the balance the bank reports. It learns each bank's message templates from the message history, then parses only messages that exactly match a template a person has approved. English and Arabic, EGP and USD. A personal tool, built for one user's own bank messages and accounts.

**No model does this work.** Template inference is a deterministic algorithm over the message corpus: value masking, longest-common-subsequence clustering, rule-based slot labelling. There is no LLM, no model call and no external inference service in the repo.

## Live demo

<!-- TODO: replace with the Railway domain once it is generated -->
**[wealthi demo](https://REPLACE-ME.up.railway.app)**, running on Railway with synthetic data.

The demo runs the real pipeline, not a mock-up. On every start it generates six months of made-up bank SMS for a made-up person: salary, rent, bills, card spending, a monthly card payment and a monthly USD saving (`backend/src/demo/ledger.ts`). It also seeds a few manual transactions, a card subscription schedule (`backend/src/demo/extras.ts`) and a CSV cashback import, so the Manual and Schedules pages have data too. It writes them to a throwaway `chat.db` and imports that with the same importer, parser and patterns code a real run uses. The bank, the person, the merchants and the card numbers are all invented.

- **The patterns are learned.** `backend/demo/patterns/demo-bank.json` is what the learner mines from those messages, enabled after review with one hand edit: the learner labelled the card's *available limit* as a balance, which it isn't. Every start loads it into the patterns table. A unit test fails if the generated messages ever make the learner produce anything else, and **Learn patterns** on the demo's Settings → Learn finds nothing new.
- **The ledger reconciles.** The SMS balances are running balances from the demo's opening balances, so checking and USD savings show a discrepancy of 0 every month, and an integration test checks that every message parses.
- **The dates follow the calendar.** The current month always has data, and a past month's transactions read the same on every start.
- **Edits are live but temporary.** Recategorizing a transaction, editing categories or toggling a pattern works; every restart, deploy or import from Settings rebuilds the demo from scratch.

## Design

- **Inferred templates, not hand-written per-bank parsers.** A new bank or a changed format is a learn run and a review, not new code.
- **Exact whole-message matching, no fuzzy matching.** A message either fits a reviewed template or becomes a parse error, so a near-match never becomes a guessed transaction.
- **Inferred patterns are written disabled.** Nothing reaches the ledger until a human enables it by hand.
- **Integer minor units in memory against a `DECIMAL(12,2)` column, no floats.** Text goes to an integer with no float step, sums are exact, and malformed or sub-cent values are rejected instead of rounded.
- **Transfers tagged from a config rule table, not inferred by matching amounts and dates.** Deterministic and auditable; a mispaired transfer would corrupt two accounts' balances at once.
- **A decode failure aborts the whole run.** Decoding is not expected to fail, so a failure means the code is wrong. The run rolls back, the code gets fixed, the same file is re-run. There is no half-imported state and nothing to reconcile by hand.
  The tradeoff across all of it: lower automatic coverage and real manual work, accepted because a wrong extraction in a financial ledger is worse than no extraction.

## Architecture

```
chat.db (read-only)
  |
  v
read -------> decode -------> parse ----------> classify -------> recompute -------> persist
reader.ts     decode.ts       parser.ts         transfer.ts       importer.ts        importer.ts
bank senders  text column or  enabled patterns  config rule       + balance.ts       one Prisma transaction
only          attributedBody  exact match       table             touched months
                                 |
                                 +--> parse errors (listed in the import report)

Settings → Learn: POST /api/patterns/learn   chat.db -> mask -> mine -> label -> sms_patterns (new ones pending)
            review: tick -> enabled, the rest -> disabled   (PATCH /api/patterns)
```

The import runs when you ask for it: the **Run import** button in Settings → Import calls `POST /api/import`, which runs `services/importer.ts` and keeps the request open until it finishes. The page shows a loading state meanwhile, then the report: months rebuilt, transactions stored, how long it took, and every message that could not be parsed, with the reason. Starting the server never imports. Only one import runs at a time; a second click (or another tab) while one is running joins it. If `chat.db` is missing, the report says so and Postgres keeps what it already holds. In demo mode (`WEALTHI_DEMO=true`, set only by the `Dockerfile`) it never reads `chat.db`: the server imports the generated demo ledger before it starts listening, and the Import button in Settings rebuilds that demo ledger again.

**Read.** `services/ingest/reader.ts` opens `chat.db` with better-sqlite3, `readonly: true`, and selects only messages whose sender handle is in the `bank_senders` table (the Settings page's *Senders*, seeded once from `bankSenders`). Messages from other senders are never read.

**Decode.** `services/ingest/decode.ts` uses the `text` column, or extracts the text from the `attributedBody` blob (streamtyped or NSKeyedArchiver), and converts the Mac epoch date. A message with no text throws `DecodeError`, which aborts the run.

**Parse.** `services/ingest/parser.ts`, built at the start of each import from the enabled rows of the `sms_patterns` table, looks up the enabled patterns of the sender's bank and calls `extract()` in `services/patterns/pattern.ts`. It checks direction, amount, currency and account, maps the source key `<bank>:<last 4 digits>` to a configured account, and compares the message currency with the account's currency. Every outcome is explicit: a transaction, a skip, or a `ParseError`.

**Classify, recompute, persist.** `transfer.ts` sets `counterAccount` from the `transfer_rules` table. Every manual transaction (the `manual_transactions` table, seeded once from config's `manualTransactions`) and every schedule's occurrences through today (each marked with its `schedule_id`) join the parsed rows as transactions; `recomputeBalances` adds the CSV entries on top and calls `computeBalance` per account per touched month. `importer.ts` writes everything in one `prisma.$transaction`.

## Template inference

**Learn patterns** in Settings → Learn (`POST /api/patterns/learn` → `services/learn-patterns.ts`) reads every message from the configured bank senders, decodes it, and groups by bank: sender handles that normalize to the same lowercase slug share one corpus and one set of patterns. `learnBank` then runs three steps, and the patterns it finds that aren't stored yet are added as *pending* for review on the same page. The review enables the ones you tick and saves the rest disabled, so the next run offers only templates it has never seen; Enabled and Disabled tabs list the reviewed ones, each with a toggle.

### 1. Mask (`services/patterns/mask.ts`)

Values recognizable without knowing any template are replaced by typed placeholders, leaving template text plus free text such as merchant names. Arabic-Indic digits are normalized, whitespace collapsed, then ordered regex rules produce `<URL> <MASKED> <CUR> <NUM> <DATE> <TIME> <ID>`. Identical masked token sequences are grouped, so each distinct sequence is mined once with its message count.

### 2. Mine (`services/patterns/mine.ts`)

Built on one assumption that holds for the banks here: within a template exactly one run of tokens varies, the shop or the counterparty.

- **Bucket.** Sequences are grouped by token count. Inside a bucket every message lines up index to index, so the positions where two sequences differ _are_ the slot. No alignment search and no similarity threshold.
- **One run.** The differing positions must be contiguous. Two separate runs mean a second thing varies, so the merge is refused and the sequences stay apart.
- **Widen.** Two templates that share a prefix and a suffix and differ only in the middle are one template whose slot is a different number of tokens wide, so the one-word shop bucket and the three-word shop bucket collapse into one. Refused when both middles hold the same literal word, which marks a template word the slot would swallow rather than a wider shop name.
- **Blocking.** A slot may not absorb a `<CUR>`, `<DATE>`, `<TIME>`, `<URL>`, or a `<MASKED>` that follows an account word, and may not cover more than half a message. This keeps amounts and account numbers out of merchant fields.
- **Variant splitting.** Widening cannot tell free text from a template word, so a slot whose first or last word takes only 2 or 3 distinct values, each seen in at least 2 sequences, is a variant: the template splits on that word and each part is mined again, to depth 8.
- **Rescue.** A template built from fewer than 3 message shapes saw no variation, so its shop or name is still literal text. If a bigger template's slot covers those messages they move there, by what the compiled pattern accepts rather than by how masking happened to mark it.

#### Two miners

`mine.ts` is the one `learn.ts` runs. It is the simpler of the two and was measured against the older miner on real messages from three banks: it reproduced every pattern that carries money, byte for byte on one bank, and split direction variants into plainly typed debit and credit patterns where the older one needed a `by-keyword` indirection.

`mine2.ts` is that older miner, kept and still maintained. It aligns sequences with a longest common subsequence scored on literal overlap, which makes no assumption about how many things vary, so it can describe a template with several independent slots that `mine.ts` cannot express at all. It is the more complex of the two and the more general, meant for message sets more varied than the ones here. It is still under review and is wired to nothing.

### 3. Label (`services/patterns/label.ts`)

Templates containing ignore words (declined, OTP, password, statement, and others, English and Arabic) are dropped. Direction comes from debit or credit words in the literal text, failing that from the values of a TEXT slot, which produces a `by-keyword` pattern; a template with no direction is dropped. Slots take a role from the preceding word, then from the values they took across the corpus: a 3 to 4 digit value with at most 3 distinct values is an account, a value at least 90% distinct over 3 or more messages is a reference. A template with no `amount` slot is dropped. Doubts (partial match, no account slot, seen once, unlabelled TEXT slot) go into a `review` list.

A pattern's id is `<bank>:` plus the first 10 hex characters of the SHA-1 of the mined template elements. Patterns use `{role:TYPE}` syntax; a slot with no role (`{:CUR}`) must be present but is not extracted.

### Worked example

`backend/test/unit/learn-patterns.test.ts` runs the real learner over a synthetic `chat.db` holding five card charges with different merchants and amounts, plus an OTP message, a message with no decodable text, and a message from an unlisted sender.

```
Your card ending *2222 was charged EGP 1.00 at ACME. Available balance EGP 900.00
```

It learns exactly one pattern, stored pending, `type: 'debit'`, `messages: 5`:

```
Your card ending {account:MASKED} was charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Available balance {:CUR} {balance:NUM}
```

Run against `Card *4321 charged EGP 1,234.50 at ACME GROCERS. Balance EGP 10,000.00`, a pattern of the same shape extracts `amount: '1,234.50'` (`parseMinor` 123450), `currency: EGP`, `merchant: ACME GROCERS`, `accountKey: bank:4321`, `balance: '10,000.00'`.

When a sender changes format, the next learn run mines a new pattern with a new id, written disabled. The previous pattern stays in the file, flagged `missing`, keeping its `enabled` state.

## Ledger correctness

**Atomic persist.** `importer2.ts` inserts the newly read transactions, upserts the monthly snapshots it recomputed, and advances the import cursor inside one Prisma interactive transaction (120 s timeout). The cursor can never move without the rows it covers: a rolled-back run leaves it untouched, and nothing is deleted. Parsing and balance math happen before the transaction. The development importer (`importer.ts`) instead deletes both tables and refills them inside one transaction.

**Idempotency.** `importer2` reads only messages whose ROWID is greater than the last stored one, then moves the cursor to the highest ROWID it read. The development importer is idempotent by construction, since it empties and refills the tables.

**Balance cascade.** A run recomputes every account from the earliest month it touched through the current month, merging stored transactions from those months with the new ones. The first month's opening balance is the closing balance of the most recent stored snapshot before it; the account's `opening_balance` (the `accounts` table) is used only when no earlier snapshot exists. `closing = opening - debits - transfersOut + credits + transfersIn`. Each snapshot stores a `discrepancy`, the computed closing minus the last balance the bank reported by SMS: a reconciliation check the computation can fail.

**Money.** Stored as `DECIMAL(12,2)`, held in memory as integer minor units (`Minor` in `utils/money.ts`). `parseMinor` goes from text to integer with no float step, all arithmetic is integer, and `minorToDecimal` formats only at the write boundary. Amounts are always positive; direction is a separate `debit`/`credit` column. Malformed values are rejected, not rounded: a non-zero third decimal place or anything outside the column's range is a `ParseError` at parse time rather than a failure at insert. Each transaction carries a currency enum (`EGP | USD`) and each account's currency is set in config. There is no FX, so a message whose currency differs from its account's is skipped.

## Tests

All test data is synthetic. Figures measured on 2026-09-19 with Node 22.

| Suite                                                       | Result                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| Backend, unit and integration (Postgres via Testcontainers) | 25 files, 396 cases: 391 pass, 5 expected failures (`it.fails`) |
| Frontend (Vitest, jsdom, MSW)                               | 8 files, 74 pass                                                |
| Playwright over the real stack                              | 2 files, 8 pass                                                 |

| Suite              | Statements | Branches | Functions | Lines  |
| ------------------ | ---------- | -------- | --------- | ------ |
| Backend (`src/**`) | 99.54%     | 96.58%   | 100%      | 99.90% |
| Frontend           | 100%       | 100%     | 100%      | 100%   |

Covered: masking, bucketing and widening, slot blocking, variant splitting and rescue for the wired
miner and clustering for the LCS one; labelling and stable ids; the learn CLI end to end; `extract` and specificity; parser results and rejections; the unmatched path, including that a disabled pattern never parses; the balance cascade; idempotent reimport; and every conversion in `money.ts` (35 cases). Stryker is configured but was not run for these figures.

## Scope

Known and deferred by choice, not undiscovered.

- **Two importers.** `importer.ts` rebuilds the whole ledger on every run, which is what a still-changing pattern set needs. `importer2.ts` is the intended importer, an incremental cursor over new messages only; its design is settled and it takes over once patterns stop changing. Manual entries, schedules and CSV entries are left out of it on purpose while that part is reworked.
- **Two miners.** `mine.ts` assumes one varying run per template, which is what these banks send and what the measurements support. `mine2.ts` drops that assumption and handles templates with several independent slots, for message sets more varied than mine; it is more complex, still under review, and not wired.
- **Unmatched queue.** Unmatched messages are listed in the report of the import that met them, in Settings → Import, until the page forgets it; they are not a durable store or a review UI. Their text stays only in `chat.db`.
- **Review depth.** Pattern inference was AI generated in a day and is the most complex part of the repo; its logic was reviewed line by line, its implementation was not. Parts of the frontend and API surface were also AI generated and not reviewed line by line. The ingestion pipeline and ledger logic were designed and reviewed deliberately.

## Running it

Requires macOS and a copy of your own iMessage `chat.db`. The copy lives in `backend/data/`, which is gitignored, and is opened read-only; it never leaves the machine. Without it you can run the test suite and the demo image (*Deploying the demo*), but not the app on your own data.

```bash
nvm use 22
npx npm@11 install                                   # from the repo root
docker compose up -d
# create backend/.env with DATABASE_URL for the Postgres in docker-compose.yml
cp backend/config/wealthi.example.json backend/config/wealthi.json   # then fill it in; its accounts, senders etc. seed the Settings page once
cd backend && npm run db:push
cp ~/Library/Messages/chat.db data/chat.db
npm run dev                     # API on http://127.0.0.1:3000
cd ../frontend && npm run dev   # http://localhost:5173
# Settings → Learn: Learn patterns, then review and confirm; Settings → Import: Run import
```

**Settings.** The accounts (with the balance each opens with), the source keys that map a matched message to an account, the transfer rules and the bank senders live in the database and are edited on the Settings page. The first start that finds each table empty fills it from `accounts` and `openingBalances`, `accountSources`, `transferRules` and `bankSenders` in `wealthi.json` and leaves the file as it was; remove those keys after that, or emptying a table brings them back on the next start. Every import reads the tables afresh, so a change applies at the next import with no restart. An account's id and currency are fixed once it exists (every ledger row holds them); its name and opening balance can change. An account can be deleted only when nothing names it: no transaction, balance, schedule, manual transaction, source, transfer rule or `csvImports` entry in the config file. The page shows what does. A transfer rule with a merchant is tried before one for any merchant. `csvImports` stays in `wealthi.json`. Upgrading, `npm run db:push` adds the `accounts`, `account_sources`, `transfer_rules` and `bank_senders` tables.

**Removing an account from the file.** While the file still carries `accounts`, `pruneUnknownAccounts()` checks every other key against it, so a deleted entry doesn't leave dangling references: the server drops each one and prints what went, and what it cost, to stderr. Dropped `transferRules` and `csvImports[].counterAccount` entries cost only the transfer tag; a dropped `accountSources` mapping, manual entry, recurring entry or whole `csvImports` entry would have been **in the balance math**. Two things are fatal, because neither can be fixed without inventing a number: a duplicate account id, and a declared account with no `openingBalances` entry. Once `accounts` is removed from the file (after the first start has seeded it) nothing is checked or dropped.

**Categories.** They live in the database and are edited on the Categories page: add, rename, reorder, delete, and map merchants to them. The first start that finds no categories stored fills them from `merchantCategories` and `extraCategories` in `wealthi.json`. After that those keys are never read again, so edits to them change nothing. A category still used by a transaction, schedule or merchant can't be deleted; the page shows what uses each one. Upgrading from the config-only version, `npm run db:push` replaces `transactions.category` with `category_id` and drops the old manual assignments. The next import would drop them anyway, since it rebuilds every row.

**Budgets.** The Spending page's *Budget* button (it toggles back to *Spending*) lists every category in the Categories page's order, with the month's spend as a bar against a monthly allowance you type in; categories left empty simply have none, and the total budget is shown on top. Upgrading, `npm run db:push` adds `categories.budget`.

**Insights.** The Insights page is a chart builder over the whole ledger, read as a sentence: *Show* Spending *by* Category *split by* Nothing, as a bar, donut, line or table. Measures are spending, income, net, cash flow, transaction count and average spend; any of them can be grouped by category, merchant, account, month, week, day or weekday, and split by category, merchant or account. A row of shortcuts (*Where it goes*, *Cash flow*, *Category trends*, *Top merchants*, *Net savings*, *Weekly rhythm*, *Daily spend*, *By account*) jumps to the usual views, the period runs 1 month to all time and ends on the newest month with data, and every chart is a way in: click a bar, slice or row to narrow the view to that category or merchant. Summary tiles compare each total with the period before it, and the Category trends cards show each category's months against what is usual by the same day and its budget. Amounts in different currencies never add up, so a view shows one currency at a time. The view is in the URL, so a chart can be bookmarked. It is drawn with [Recharts](https://recharts.org); the chart code is loaded only when the page is opened.

**Schedules.** Anything that repeats without a bank message (rent, a subscription, interest) is a schedule, added on the Schedules page: an amount, an account, a merchant, an optional category, and how often (every N days, weeks, months or years) from a start date to an optional end date. Each import adds every occurrence from the start date through today, marked as scheduled on the ledger; a new or edited schedule shows up after the next import, and an edit rewrites past occurrences too, so to change an amount from some date on, end the schedule and add a new one. The first start that finds no schedules stored turns `recurringTransactions` in `wealthi.json` into monthly ones; remove the key after that, or emptying the page brings them back on the next start. Upgrading, `npm run db:push` adds the `schedules` table and `transactions.schedule_id`.

**Manual transactions.** A one-off entry with no bank message (a fee, a reversal, an adjustment) is added in Settings → Manual: a direction, an amount, an account, a merchant, an optional category and a date. They are stored in their own `manual_transactions` table, and every import copies each one into the ledger next to the parsed rows (and counts it in the balances), so the rebuild never loses them; a new, edited or deleted one shows up after the next import. The first start that finds the table empty copies `manualTransactions` from `wealthi.json` into it and leaves the file as it was; remove the key after that, or emptying the table brings them back on the next start. Upgrading, `npm run db:push` adds the `manual_transactions` table.

`npm run test:e2e` from the repo root runs Playwright against a throwaway Postgres seeded from a synthetic `chat.db`, and tears it down afterwards. Needs Docker.

## Deploying the demo

The `Dockerfile` builds the demo: the API and the built frontend in one container, configured from `backend/demo/`. `railway.json` tells Railway to build it and to health-check `/api/health`. Nothing personal can reach the image: `backend/config/` and `backend/data/` are gitignored, so a GitHub deploy never sees them, and `.dockerignore` keeps them out of a local build too.

1. In Railway, create a project from this GitHub repo. It picks up `railway.json` and builds the `Dockerfile`.
2. Add a PostgreSQL database to the project.
3. On the app service, set one variable: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`. That is the private-network URL; use your database service's name if it isn't `Postgres`. Railway sets `PORT`, and the `Dockerfile` sets everything else.
4. Under the app service's *Settings → Networking*, generate a domain. Leave the database's public TCP proxy off: nothing outside the project needs it.

Each start runs `prisma db push`, seeds the demo, then listens; the health check passes once the data is in. The seed wipes the database it's pointed at, so it refuses to run unless the app is on the demo config and every SMS row already stored is demo data: pointed at a real ledger by mistake, it stops instead of replacing it.

To try the image locally: `docker build -t wealthi-demo .`, then `docker run -p 127.0.0.1:8080:8080 -e PORT=8080 -e DATABASE_URL=… wealthi-demo` against a disposable Postgres.

## Reading guide

1. `backend/src/services/patterns/mine.ts`: length bucketing with typed slot blocking, variant splitting and rescue. The core of template inference. `mine2.ts` beside it is the more general LCS variant, still under review.
2. `backend/src/services/patterns/label.ts`: mined templates to typed patterns, from context words and value distributions.
3. `backend/src/services/patterns/pattern.ts`: the `{role:TYPE}` format, its compiler, and the specificity-ranked whole-message `extract()`.
4. `backend/src/services/ingest/parser.ts`: the enabled-only gate and the explicit match, skip and error results.
5. `backend/test/integration/pipeline.test.ts` with `backend/test/fixtures/messages.ts`: the live pipeline end to end on a synthetic `chat.db`, checked against hand-derived balances.
