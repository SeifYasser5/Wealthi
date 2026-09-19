# Wealthi

Wealthi turns bank SMS notifications, as they arrive in the macOS Messages database (`chat.db`), into a structured ledger in Postgres: one row per transaction, internal transfers tagged, monthly balance snapshots reconciled against the balance the bank reports. It learns each bank's message templates from the message history, then parses only messages that exactly match a template a person has approved. English and Arabic, EGP and USD. A personal tool, built for one user's own bank messages and accounts.

**No model does this work.** Template inference is a deterministic algorithm over the message corpus: value masking, longest-common-subsequence clustering, rule-based slot labelling. There is no LLM, no model call and no external inference service in the repo.

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
                                 +--> parse errors (count in import summary)

offline: npm run patterns:learn   chat.db -> mask -> mine -> label -> config/patterns/<bank>.json (disabled)
```

The import runs once, when the server starts (`backend/src/server.ts`), through `services/importer.ts`. There is no HTTP endpoint and no npm script that runs it. If `chat.db` is missing, the server skips the import and serves what is already in Postgres.

**Read.** `services/ingest/reader.ts` opens `chat.db` with better-sqlite3, `readonly: true`, and selects only messages whose sender handle is listed in `bankSenders`. Messages from other senders are never read.

**Decode.** `services/ingest/decode.ts` uses the `text` column, or extracts the text from the `attributedBody` blob (streamtyped or NSKeyedArchiver), and converts the Mac epoch date. A message with no text throws `DecodeError`, which aborts the run.

**Parse.** `services/ingest/parser.ts` looks up the sender's enabled patterns and calls `extract()` in `services/patterns/pattern.ts`. It checks direction, amount, currency and account, maps the source key `<bank>:<last 4 digits>` to a configured account, and compares the message currency with the account's currency. Every outcome is explicit: a transaction, a skip, or a `ParseError`.

**Classify, recompute, persist.** `transfer.ts` sets `counterAccount` from `transferRules`. `recomputeBalances` merges parsed rows with manual, recurring and CSV entries from config and calls `computeBalance` per account per touched month. `importer.ts` writes everything in one `prisma.$transaction`.

## Template inference

`npm run patterns:learn` reads every message from the configured bank senders, decodes it, and groups by bank: sender handles that normalize to the same lowercase slug share one corpus and one pattern file. `learnBank` then runs three steps.

### 1. Mask (`services/patterns/mask.ts`)

Values recognizable without knowing any template are replaced by typed placeholders, leaving template text plus free text such as merchant names. Arabic-Indic digits are normalized, whitespace collapsed, then ordered regex rules produce `<URL> <MASKED> <CUR> <NUM> <DATE> <TIME> <ID>`. Identical masked token sequences are grouped, so each distinct sequence is mined once with its message count.

### 2. Mine (`services/patterns/mine.ts`)

- **Cluster.** Sequences are processed most frequent first. Each one tries to fit an existing template, otherwise merges into the best-scoring template or starts a new one.
- **Compare.** The merge score is a longest common subsequence over tokens, a DP table in a flat `Uint16Array`. Tokens match on exact equality, except `<NUM>` and `<ID>` which are treated as equal.
- **Threshold.** A merge needs at least 2 matched literal tokens and a literal overlap of at least 0.6.
- **Slots.** Every gap between aligned tokens becomes a `<TEXT>` slot, at most 4 per template.
- **Blocking.** A gap may not absorb a `<CUR>`, `<DATE>`, `<TIME>`, `<URL>`, or a `<MASKED>` that follows an account word. This keeps amounts and account numbers out of merchant fields.
- **Variant splitting.** If a slot's first or last word takes only 2 or 3 distinct values, each seen in at least 2 sequences, the template splits on that word and each part is mined again, to depth 8. This separates template variants from free text.

### 3. Label (`services/patterns/label.ts`)

Templates containing ignore words (declined, OTP, password, statement, and others, English and Arabic) are dropped. Direction comes from debit or credit words in the literal text, failing that from the values of a TEXT slot, which produces a `by-keyword` pattern; a template with no direction is dropped. Slots take a role from the preceding word, then from the values they took across the corpus: a 3 to 4 digit value with at most 3 distinct values is an account, a value at least 90% distinct over 3 or more messages is a reference. A template with no `amount` slot is dropped. Doubts (partial match, no account slot, seen once, unlabelled TEXT slot) go into a `review` list.

A pattern's id is `<bank>:` plus the first 10 hex characters of the SHA-1 of the mined template elements. Patterns use `{role:TYPE}` syntax; a slot with no role (`{:CUR}`) must be present but is not extracted.

### Worked example

`backend/test/unit/learn-patterns.test.ts` runs the real CLI over a synthetic `chat.db` holding five card charges with different merchants and amounts, plus an OTP message, a message with no decodable text, and a message from an unlisted sender.

```
Your card ending *2222 was charged EGP 1.00 at ACME. Available balance EGP 900.00
```

The CLI writes exactly one pattern, `enabled: false`, `type: 'debit'`, `messages: 5`:

```
Your card ending {account:MASKED} was charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Available balance {:CUR} {balance:NUM}
```

Run against `Card *4321 charged EGP 1,234.50 at ACME GROCERS. Balance EGP 10,000.00`, a pattern of the same shape extracts `amount: '1,234.50'` (`parseMinor` 123450), `currency: EGP`, `merchant: ACME GROCERS`, `accountKey: bank:4321`, `balance: '10,000.00'`.

When a sender changes format, the next learn run mines a new pattern with a new id, written disabled. The previous pattern stays in the file, flagged `missing`, keeping its `enabled` state.

## Ledger correctness

**Atomic persist.** `importer2.ts` inserts the newly read transactions, upserts the monthly snapshots it recomputed, and advances the import cursor inside one Prisma interactive transaction (120 s timeout). The cursor can never move without the rows it covers: a rolled-back run leaves it untouched, and nothing is deleted. Parsing and balance math happen before the transaction. The development importer (`importer.ts`) instead deletes both tables and refills them inside one transaction.

**Idempotency.** `importer2` reads only messages whose ROWID is greater than the last stored one, then moves the cursor to the highest ROWID it read. The development importer is idempotent by construction, since it empties and refills the tables.

**Balance cascade.** A run recomputes every account from the earliest month it touched through the current month, merging stored transactions from those months with the new ones. The first month's opening balance is the closing balance of the most recent stored snapshot before it; `openingBalances` in config is used only when no earlier snapshot exists. `closing = opening - debits - transfersOut + credits + transfersIn`. Each snapshot stores a `discrepancy`, the computed closing minus the last balance the bank reported by SMS: a reconciliation check the computation can fail.

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
| Backend (`src/**`) | 99.55%     | 97.25%   | 100%      | 99.89% |
| Frontend           | 100%       | 100%     | 100%      | 100%   |

Covered: masking, clustering, slot blocking and variant splitting; labelling and stable ids; the learn CLI end to end; `extract` and specificity; parser results and rejections; the unmatched path, including that a disabled pattern never parses; the balance cascade; idempotent reimport; and every conversion in `money.ts` (35 cases). Stryker is configured but was not run for these figures.

## Scope

Known and deferred by choice, not undiscovered.

- **Two importers.** `importer.ts` rebuilds the whole ledger on every run, which is what a still-changing pattern set needs. `importer2.ts` is the intended importer, an incremental cursor over new messages only; its design is settled and it takes over once patterns stop changing. Manual, recurring and CSV entries are left out of it on purpose while that part is reworked.
- **Unmatched queue.** Unmatched messages are a count in the import summary, not a durable store or a review UI. Their text stays only in `chat.db`.
- **Review depth.** Pattern inference was AI generated in a day and is the most complex part of the repo; its logic was reviewed line by line, its implementation was not. Parts of the frontend and API surface were also AI generated and not reviewed line by line. The ingestion pipeline and ledger logic were designed and reviewed deliberately.

## Running it

Requires macOS and a copy of your own iMessage `chat.db`. The copy lives in `backend/data/`, which is gitignored, and is opened read-only; it never leaves the machine. Without it you can run the test suite, but not the app.

```bash
nvm use 22
npx npm@11 install                                   # from the repo root
docker compose up -d
# create backend/.env with DATABASE_URL for the Postgres in docker-compose.yml
cp backend/config/wealthi.example.json backend/config/wealthi.json   # then fill it in
cd backend && npm run db:push
cp ~/Library/Messages/chat.db data/chat.db
npm run patterns:learn          # then set "enabled": true in config/patterns/<bank>.json
npm run dev                     # API on http://127.0.0.1:3000, imports on start
cd ../frontend && npm run dev   # http://localhost:5173
```

`npm run test:e2e` from the repo root runs Playwright against a throwaway Postgres seeded from a synthetic `chat.db`, and tears it down afterwards. Needs Docker.

## Reading guide

1. `backend/src/services/patterns/mine.ts`: LCS clustering with typed slot blocking and recursive variant splitting. The core of template inference.
2. `backend/src/services/patterns/label.ts`: mined templates to typed patterns, from context words and value distributions.
3. `backend/src/services/patterns/pattern.ts`: the `{role:TYPE}` format, its compiler, and the specificity-ranked whole-message `extract()`.
4. `backend/src/services/ingest/parser.ts`: the enabled-only gate and the explicit match, skip and error results.
5. `backend/test/integration/pipeline.test.ts` with `backend/test/fixtures/messages.ts`: the live pipeline end to end on a synthetic `chat.db`, checked against hand-derived balances.
