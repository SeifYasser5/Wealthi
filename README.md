# Wealthi

Wealthi turns bank SMS notifications, as they arrive in the macOS Messages database (`chat.db`), into a structured ledger in Postgres: one row per transaction, internal transfers tagged, and monthly balance snapshots reconciled against the balance the bank reports. It learns each bank's message templates from the message history, then parses only messages that exactly match a template a person has approved. It handles English and Arabic templates, in EGP and USD. It is a personal tool, built for one user's own bank messages and accounts.

**No model does this work.** Template inference is a deterministic algorithm over the message corpus: value masking, longest-common-subsequence clustering, and rule-based slot labelling. There is no LLM, no model call, and no external inference service anywhere in the repo. No model API or HTTP client appears in `backend/src` or in any `package.json` dependency. The only network reference in the app is a Google Fonts link in `frontend/index.html`.

## Design stance: correctness over coverage

The pipeline never guesses.

- **Whole-message matches only.** Each pattern compiles to a regex anchored at both ends. A message is parsed only if it matches in full. When several patterns match, the one with the most literal tokens wins.
- **No fuzzy matching.** There is no edit distance, no similarity scoring, and no partial extraction.
- **Unmatched means error.** A message that matches no enabled pattern becomes a parse error in the import summary and is never guessed at. The import reports the error count.
- **Humans enable patterns.** Newly inferred patterns are written disabled, and the parser loads only enabled ones. No inferred template can affect the ledger until someone enables it by hand.

The tradeoff: lower automatic coverage and real manual work, accepted deliberately, because a wrong extraction in a financial ledger is worse than no extraction.

## Architecture

```
chat.db (read-only)
  |
  v
read -------> decode -------> parse ----------> classify -------> recompute -------> persist
reader.ts     decode.ts       parser.ts         transfer.ts       importer.ts        importer.ts
bank senders  text column or  enabled patterns  config rule       + balance.ts       one Prisma transaction:
only          attributedBody  exact match       table             last 6 months      delete, insert, upsert
                                 |
                                 +--> parse errors (count in import summary)

offline: npm run patterns:learn   chat.db -> mask -> mine -> label -> config/patterns/<bank>.json (disabled)
```

The import runs once, when the server starts (`backend/src/server.ts`), through `services/importer.ts`, the currently wired development importer. There is no HTTP endpoint and no npm script that runs it. If `chat.db` is missing, the server skips the import and serves what is already in Postgres.

**Read.** `services/ingest/reader.ts` opens `chat.db` with better-sqlite3, `readonly: true`. It selects messages whose sender handle is listed in `bankSenders` in config, ordered by date and ROWID. Messages from other senders are never read.

**Decode.** `services/ingest/decode.ts` uses the `text` column, or else extracts the text from the `attributedBody` blob (streamtyped or NSKeyedArchiver). It converts the Mac epoch date. A message with no text throws `DecodeError`.

**Parse.** `services/ingest/parser.ts` looks up the sender's enabled patterns and calls `extract()` in `services/patterns/pattern.ts`. It checks direction, amount, currency and account, maps the source key `<bank>:<last 4 digits>` to a configured account, and compares the message currency with the account's currency. Every outcome is explicit: a transaction, a skip, or a `ParseError`.

**Classify transfers.** `services/ingest/transfer.ts` sets `counterAccount` from `transferRules` in config. A transfer is a tag on a normal debit or credit, set by a rule table, not by matching amounts and dates.

**Recompute balances.** `recomputeBalances` in `services/importer.ts` merges the parsed rows with manual, recurring and CSV entries from config, keeps the last 6 months, and calls `computeBalance` (`services/ingest/balance.ts`) per account per month.

**Persist.** `services/importer.ts` writes everything in one `prisma.$transaction`: delete both tables, insert transactions (`db/transactions.ts`), upsert monthly balances (`db/balances.ts`). The server then logs the month count, the stored count, and the error count.

## Template inference

`npm run patterns:learn` (`backend/src/services/learn-patterns.ts`) reads every message from the configured bank senders and decodes it. Undecodable messages are counted and skipped. Messages are grouped by bank: sender handles that normalize to the same lowercase slug share one corpus and one pattern file. `learnBank` (`services/patterns/learn.ts`) then runs three steps on each corpus.

### 1. Mask (`services/patterns/mask.ts`)

Values that can be recognized without knowing any template are replaced by typed placeholders, so that what remains is template text plus free text such as merchant names.

- Arabic-Indic digits are normalized and whitespace is collapsed.
- Ordered regex rules replace values with `<URL> <MASKED> <CUR> <NUM> <DATE> <TIME> <ID>`. The currency set is `EGP|USD|EUR|جم|دولار`.
- The result is tokenized. Messages with identical masked token sequences are grouped, so each distinct sequence is mined once, with its message count.

### 2. Mine (`services/patterns/mine.ts`)

Mining turns the masked sequences into templates with typed gaps.

- **Cluster.** Sequences are processed most frequent first, then by length. Each one first tries to fit an existing template (the template compiled to a regex). Otherwise it merges into the best-scoring template, or starts a new one.
- **Compare.** The merge score is a longest common subsequence over tokens, computed with a DP table in a flat `Uint16Array`. Tokens are equal only on exact match, except that `<NUM>` and `<ID>` are treated as equal.
- **Threshold.** A merge needs at least 2 matched literal tokens and a literal overlap of at least 0.6 (`MIN_LITERAL_OVERLAP`).
- **Slots.** Every gap between aligned tokens becomes a `<TEXT>` slot, with at most 4 slots per template. Aligned `<NUM>`/`<ID>` mismatches become `<ID>`.
- **Blocking rules.** A gap may not absorb a `<CUR>`, `<DATE>`, `<TIME>` or `<URL>`, or a `<MASKED>` that follows an account word. This keeps amounts and account numbers out of merchant fields.
- **Variant splitting.** If a slot's first or last word takes only 2 or 3 distinct values, each seen in at least 2 sequences, the template is split on that word and each part is mined again. Recursion stops at depth 8. This separates template variants from free text.

The output is a list of templates, each with its member sequences, sorted by message count.

### 3. Label (`services/patterns/label.ts`)

Labelling decides which templates are transactions and what each slot means.

- **Drop non-transactions.** Templates containing ignore words (declined, OTP, password, statement and others, in English and Arabic) are dropped.
- **Direction.** Direction comes from debit or credit words in the template's literal text. Failing that, it comes from the values of a TEXT slot, which produces a pattern of type `by-keyword`. A template with no direction is dropped.
- **Roles by preceding word.** Each slot first gets a role from the word before it (`roleByContext`).
- **Roles by observed values.** Slots still unlabelled get a role from the values they took across the corpus (`roleByValues`). A 3 to 4 digit value with at most 3 distinct values is an account. A value that is at least 90% distinct over 3 or more messages is a reference.
- **Amount required.** A template with no `amount` slot is dropped.
- **Review notes.** Doubts are written into a `review` list: partial match, no account slot, seen once, or an unlabelled TEXT slot.

Each pattern's id is `<bank>:` plus the first 10 hex characters of the SHA-1 of the mined template elements. Patterns are written in `{role:TYPE}` syntax, where a slot with no role (`{:CUR}`) must be present but is not extracted.

### Worked example

These values are asserted in the tests.

`backend/test/unit/learn-patterns.test.ts` runs the real CLI over a synthetic `chat.db`. The corpus holds five card charges of this shape with different merchants and amounts, plus an OTP message, a message with no decodable text, and a message from an unlisted sender:

```
Your card ending *2222 was charged EGP 1.00 at ACME. Available balance EGP 900.00
Your card ending *2222 was charged EGP 2.00 at CITY CAFE. Available balance EGP 899.00
```

The CLI writes exactly one pattern, `enabled: false`, `type: 'debit'`, `messages: 5`:

```
Your card ending {account:MASKED} was charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Available balance {:CUR} {balance:NUM}
```

Extraction of a pattern of the same shape is asserted in `backend/test/unit/pattern.test.ts`. The pattern `Card {account:MASKED} charged {currency:CUR} {amount:NUM} at {merchant:TEXT} . Balance {:CUR} {balance:NUM}`, run against

```
Card *4321 charged EGP 1,234.50 at ACME GROCERS. Balance EGP 10,000.00
```

yields:

```
patternId:   bank:charge
type:        debit
amount:      '1,234.50'    (parseMinor: 123450)
currency:    EGP
balance:     '10,000.00'
merchant:    ACME GROCERS
accountKey:  bank:4321
reference:   null
```

Amounts leave `extract()` as raw text. The parser turns them into integer minor units (see [Ledger correctness](#ledger-correctness)), and `accountKey` is mapped to an account through `accountSources` in config.

## Template lifecycle and format changes

A pattern's id is a hash of its mined elements. When a sender changes format, the next learn run mines a new pattern with a new id, which is written disabled. The previous pattern stays in the same file, flagged `missing`, and keeps its `enabled` state.

Transactions are not bound to the pattern that parsed them. The live importer rebuilds the whole ledger from the currently enabled patterns on every run, so disabling a pattern removes its historical rows.

## Ledger correctness

**Amounts.**
- Stored in Postgres as `DECIMAL(12,2)`: transaction amounts, reported balances, and every monthly balance column.
- In memory, money is integer minor units (`Minor` in `backend/src/utils/money.ts`, 12.34 becomes 1234).
- `parseMinor` turns message and CSV text into `Minor` directly: it joins the whole-unit digits and the fraction padded to two places and calls `parseInt` once. No float is involved.
- All balance and spending arithmetic is integer. `minorToDecimal` produces an exact two-place string only at the database write boundary.
- Amounts are always positive. Direction lives in a separate `debit`/`credit` column.

**Malformed amounts are rejected, not coerced.** `parseMinor` accepts an optional `-`, plain digits or groups of three separated by comma or whitespace, and an optional decimal part. It rejects a non-zero third decimal place and anything outside the `DECIMAL(12,2)` column's range. In the parser a malformed amount or balance is a `ParseError`, not a rounded number, so an out-of-range amount becomes a `ParseError` like any other malformed value instead of failing at insert. In CSV import it throws. A sub-cent amount in config fails validation.

**Currency.** Each transaction carries a currency enum (`EGP | USD`), and each account's currency is set in config. There is no FX. A message whose currency differs from its account's currency is skipped, not converted, and the skip is not recorded. `EUR` is recognized by the pattern tokens but is not in the enum, so EUR messages are always skipped.

**Atomic persist.** In `importer2.ts`, a run inserts only the newly read transactions, upserts the monthly balance snapshots for the months it recomputed, and advances the import cursor, all inside one Prisma interactive transaction (120 s timeout). The cursor can never move without the rows it covers: a rolled-back run leaves it untouched. Nothing is deleted. Parsing and balance math happen before the transaction. If nothing parses, the importer returns before touching the database. The development importer (`importer.ts`) instead deletes both tables and refills them inside the same single transaction.

**Idempotency.**
- In `importer2.ts`, reimport is idempotent because the cursor only advances: a run reads only messages whose ROWID is greater than the last stored one, then moves the cursor to the highest ROWID it read.
- This relies on the cursor being correct. `createAllTransactions` does not pass `skipDuplicates`, so a re-read message with an existing `message_guid` raises a unique violation and rolls the whole run back instead of being skipped. That is the intended fail-loud behaviour described under Known defects.
- The development importer is idempotent by construction instead, because it empties and refills the tables. Rerunning it produces the same row count (`pipeline.test.ts`).

**Balance cascade.**
- In `importer2.ts`, a run recomputes every account from the earliest month it touched through the current month. Stored transactions from those months are merged with the new ones, so each snapshot covers the full month.
- The first month's opening balance is the closing balance of the most recent stored snapshot before it, not a config value. `openingBalances` in config is used only when no earlier snapshot exists, or for an account missing from that snapshot. Each month's closing becomes the next month's opening.
- `closing = opening - debits - transfersOut + credits + transfersIn`.
- Each snapshot stores a `discrepancy`: the computed closing minus the last balance the bank reported by SMS. It is a reconciliation check the computation can fail.
- The development importer instead fully recomputes the last 6 months that have data, seeded from `openingBalances` in config. Months older than that window keep their transactions but get no snapshot.
- In the development importer, manual, recurring and CSV entries count toward balances but are never inserted into `transactions`, so the transaction and spending views do not show them. These entries are not in `importer2` yet (see Scope).

## Tests

All test data is synthetic. Figures measured on 2026-09-19 with Node 22:

| Suite | Result |
|---|---|
| Backend, unit and integration (Postgres via Testcontainers) | 25 files, 396 cases: 391 pass, 5 are expected failures (`it.fails`) |
| Frontend (Vitest, jsdom, MSW) | 8 files, 74 pass |
| Playwright over the real stack | 2 files, 8 pass |

v8 coverage:

| Suite | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Backend (`src/**`) | 99.55% | 97.25% | 100% | 99.89% |
| Frontend | 100% | 100% | 100% | 100% |

Stryker mutation testing is configured but was not run for these figures.

Covered areas:

- **Inference.** Masking, LCS clustering, slot blocking and variant splitting (`mask-mine.test.ts`), labelling (`label.test.ts`), `learnBank` and stable ids (`learn.test.ts`), the CLI end to end (`learn-patterns.test.ts`), and pattern merging (`store.test.ts`).
- **Extraction.** `compile`, `extract` and specificity (`pattern.test.ts`), parser results and rejections (`parser.test.ts`), stored values end to end (`pipeline.test.ts`).
- **The unmatched path.** A disabled pattern never parses (`parser.test.ts`). The import summary holds the expected errors (`pipeline.test.ts`). The logged error count is asserted in `server.test.ts`.
- **The balance cascade.** `balance.test.ts`, `pipeline.test.ts`, `importer-window.test.ts`, `importer2.test.ts`, `db.test.ts`, and `e2e/ledger.spec.ts`.
- **Idempotent reimport.** A second live import yields the same row count (`pipeline.test.ts`).
- **Money parsing.** `parseMinor` separators, padding, rejections and range, plus every conversion in `money.ts` (`money.test.ts`, 35 cases).

## Decisions

**Inferred templates instead of hand-written per-bank parsers.**
Rejected: a parser module per bank. An earlier hardcoded parser (`services/parse/index.ts`) was removed.
Why: a new bank or a changed format is handled by a learn run and a review, not by new code.
Cost: the learner's word lists and thresholds are hardcoded, and cover English and Arabic only.

**Exact whole-message matching instead of fuzzy matching.**
Rejected: similarity scoring, edit distance, or partial extraction.
Why: a message either fits a reviewed template or becomes an error, so a near-match never becomes a guessed transaction.
Cost: any format change stops parsing for that template until a new pattern is enabled.

**Integer minor units in memory against a `DECIMAL(12,2)` column, instead of floats end to end.**
Rejected: parsing with `parseFloat` and rounding arithmetic to two places.
Why: text goes to an integer with no float step, sums are exact, and malformed or sub-cent values are rejected instead of rounded.
Cost: conversions at every boundary.

**Full rebuild during development, incremental import once patterns settle.**
Rejected: switching to the incremental cursor importer (`importer2.ts`) before the pattern set is settled.
Why: every change to the enabled patterns requires re-parsing the whole history, which full replacement does by construction and an incremental cursor does not.
Cost: row ids regenerate on every start, manual categories are lost, and disabling a pattern deletes its history. All three go away when `importer2` takes over.

**Transfers tagged by a config rule table instead of inferred.**
Rejected: heuristic pairing by matching amounts and dates across accounts.
Why: a rule in `transferRules` is deterministic and auditable, and a mispaired transfer would corrupt two accounts' balances at once.
Cost: every transfer route needs a config entry, and an unconfigured transfer stays an ordinary debit or credit.

## Known defects

Each known defect is encoded as a failing test (`it.fails`) rather than a comment, so the suite fails loudly if one is silently fixed or forgotten.

- **Transfer split disabled.** `if (false) transfersOut += …` in `balance.ts` counts outgoing transfers as debits. Closing balances are unaffected. Pinned by `test/unit/balance.test.ts:65`.
- **Uncaught `DecodeError` in the live importer.** One message with no decodable text aborts the whole import in `importer.ts`. Pinned by `test/integration/pipeline.test.ts:117`.
- **Uncaught `DecodeError` in the cursor importer.** The same failure in `importer2.ts`. Pinned by `test/integration/importer2.test.ts:131`.
- **Missing `skipDuplicates`.** `createAllTransactions` documents it but never passes it to `createMany`, so `importer2` fails with a unique violation on a re-read message. That is intended: chat.db ROWIDs are monotonic and the cursor only advances, so a duplicate `message_guid` means the cursor or the read logic is wrong, and it should roll back loudly rather than be skipped. Outstanding: the docstring in `db/transactions.ts` and the comment in `schema.prisma` still describe skipping, and the test still pins this as a failure. Pinned by `test/integration/importer2.test.ts:122`.
- **Merchant baked into a label.** A single-word merchant can split off into a `by-keyword` pattern with the merchant fixed as literal text. Pinned by `test/unit/label.test.ts:150`.

## Scope

This tool does what its single user needs and stops there. The defects above and the gaps below are known, and deferred by choice rather than undiscovered.

- **Unmatched queue.** Unmatched messages are a count in the import summary, not a durable store or a review UI. Their text stays only in `chat.db`.
- **Pattern review.** Enabling a pattern means editing a JSON file by hand. Nothing records who reviewed a pattern or when.
- **Two importers.** `services/importer2.ts` is the intended importer: an incremental cursor reads only new messages and recomputes only the affected months. Its design is settled. It is not wired yet because patterns are still being learned and enabled, and every change to the enabled set needs the whole history re-parsed, which `services/importer.ts` does by rebuilding the ledger on every run. `importer2` takes over once the pattern set is settled. Manual, recurring and CSV entries are left out of it on purpose while that part of the design is reworked; porting them is not a blocker.
- **Manual categories.** Categories set through the API do not survive the rebuild, which runs on every server start.
- **Format changes.** A mid-history sender format change has no end-to-end test.
- **Demo.** There is no seeded demo path, so running the app requires the user's own message database.
- **Review depth.** Parts of the frontend and API surface were AI generated for speed and were not reviewed line by line. The ingestion pipeline, pattern inference and ledger logic were designed and reviewed deliberately.

## Running it

Requires macOS and a copy of your own iMessage `chat.db`. The copy lives in `backend/data/`, which is gitignored, and is opened read-only; it never leaves the machine.

There is no seeded demo yet. Without your own message database you can run the test suite, but not the app.

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

`npm run test:e2e` from the repo root runs Playwright against a throwaway Postgres seeded from a synthetic `chat.db`, and tears it down afterwards. It needs Docker.

## Reading guide

1. `backend/src/services/patterns/mine.ts`: LCS clustering with typed slot blocking and recursive variant splitting. The core of template inference.
2. `backend/src/services/patterns/label.ts`: turns mined templates into typed patterns from context words and value distributions, and writes the review notes.
3. `backend/src/services/patterns/pattern.ts`: the `{role:TYPE}` format, its compiler, and the specificity-ranked whole-message `extract()`.
4. `backend/src/services/ingest/parser.ts`: the enabled-only gate and the explicit match, skip and error results.
5. `backend/test/integration/pipeline.test.ts` with `backend/test/fixtures/messages.ts`: the live pipeline end to end on a synthetic `chat.db`, checked against hand-derived balances.
