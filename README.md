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

**Classify, recompute, persist.** `transfer.ts` sets `counterAccount` from `transferRules`. Manual and recurring entries from config join the parsed rows as transactions; `recomputeBalances` adds the CSV entries on top and calls `computeBalance` per account per touched month. `importer.ts` writes everything in one `prisma.$transaction`.

## Template inference

`npm run patterns:learn` reads every message from the configured bank senders, decodes it, and groups by bank: sender handles that normalize to the same lowercase slug share one corpus and one pattern file. `learnBank` then runs three steps.

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
| Backend (`src/**`) | 99.54%     | 96.58%   | 100%      | 99.90% |
| Frontend           | 100%       | 100%     | 100%      | 100%   |

Covered: masking, bucketing and widening, slot blocking, variant splitting and rescue for the wired
miner and clustering for the LCS one; labelling and stable ids; the learn CLI end to end; `extract` and specificity; parser results and rejections; the unmatched path, including that a disabled pattern never parses; the balance cascade; idempotent reimport; and every conversion in `money.ts` (35 cases). Stryker is configured but was not run for these figures.

## Scope

Known and deferred by choice, not undiscovered.

- **Two importers.** `importer.ts` rebuilds the whole ledger on every run, which is what a still-changing pattern set needs. `importer2.ts` is the intended importer, an incremental cursor over new messages only; its design is settled and it takes over once patterns stop changing. Manual, recurring and CSV entries are left out of it on purpose while that part is reworked.
- **Two miners.** `mine.ts` assumes one varying run per template, which is what these banks send and what the measurements support. `mine2.ts` drops that assumption and handles templates with several independent slots, for message sets more varied than mine; it is more complex, still under review, and not wired.
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

**Removing an account.** `accounts` in `wealthi.json` is referenced from six other keys, so deleting an entry leaves those references dangling. The server no longer refuses to start over them: it drops each one and prints what went, and what it cost, to stderr. Dropped `transferRules` and `csvImports[].counterAccount` entries cost only the transfer tag, so balances are unchanged; a dropped `accountSources` mapping, manual entry, recurring entry or whole `csvImports` entry was **in the balance math**, so balances will move on the next import. The startup warning is the list of entries to clean up. Two things are still fatal, because neither can be fixed without inventing a number: a duplicate account id, and a declared account with no `openingBalances` entry.

`npm run test:e2e` from the repo root runs Playwright against a throwaway Postgres seeded from a synthetic `chat.db`, and tears it down afterwards. Needs Docker.

## Reading guide

1. `backend/src/services/patterns/mine.ts`: length bucketing with typed slot blocking, variant splitting and rescue. The core of template inference. `mine2.ts` beside it is the more general LCS variant, still under review.
2. `backend/src/services/patterns/label.ts`: mined templates to typed patterns, from context words and value distributions.
3. `backend/src/services/patterns/pattern.ts`: the `{role:TYPE}` format, its compiler, and the specificity-ranked whole-message `extract()`.
4. `backend/src/services/ingest/parser.ts`: the enabled-only gate and the explicit match, skip and error results.
5. `backend/test/integration/pipeline.test.ts` with `backend/test/fixtures/messages.ts`: the live pipeline end to end on a synthetic `chat.db`, checked against hand-derived balances.
