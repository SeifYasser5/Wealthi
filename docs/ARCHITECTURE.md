# Wealthi — Architecture

## Overview

Wealthi turns the bank notification SMS that pile up on a phone into a reliable, queryable financial picture. Banks already announce every charge, transfer, and deposit by text; Wealthi captures those messages, parses them into structured transactions, and maintains per-account monthly balances — so the messy, per-bank stream of notifications becomes a single ledger you can ask questions of.

## Stack

TypeScript end to end. The backend is Node + Express with Prisma over PostgreSQL (via the `pg` adapter); the iMessage store is read directly through SQLite. The frontend is React (Vite) with React Router and TanStack Query.

## Architecture / data flow

The system is a one-way pipeline from raw SMS to a read-optimized ledger. Each stage has a single job and hands a cleaner shape to the next.

```
chat.db ─▶ reader ─▶ decode ─▶ parse ─▶ classify ─▶ balance ─▶ Postgres ─▶ read API ─▶ web UI
(SQLite)   (rows)    (text)   (patterns) (transfers) (cascade)  (ledger)    (query)    (React)
```

### 1. Ingestion — reading the SMS

Bank texts arrive as iMessages, so the source of truth is the macOS `chat.db` SQLite database. The reader opens it **read-only** and selects only messages from known bank sender IDs, ordered by message `date`, then `ROWID` to break ties.

The key decision is the **cursor**: each import remembers the highest `ROWID` it has already scanned and asks only for rows beyond it. `ROWID` reflects insertion order, so a message that was delivered late — a back-dated transaction — still gets a fresh, higher `ROWID` and is picked up on the next run. This makes imports incremental and cheap without missing stragglers.

> **Note — as-built.** This describes the intended design, implemented in `importer2.ts`, which is
> **not currently wired up**. The importer the server actually runs (`importer.ts`) ignores the
> cursor, re-reads every message, deletes `transactions` and `monthly_balances` wholesale, and
> rebuilds a rolling **6-month** window each run. `import_state` is unused in the live path. See
> [AGENTS.md](../AGENTS.md) → *Running an import* for the side-by-side.

### 2. Decoding — recovering the text

A message's text isn't always in the `text` column; older and newer iMessages stash it inside a binary `attributedBody` blob in two different archive formats (NSKeyedArchiver and the legacy streamtyped encoding). Decode handles both, falling back to blob extraction only when the plain column is empty.

The design decision here is **tolerance over strictness**: real message stores contain mixed encodings and the occasional undecodable blob. Decode normalizes everything to a single `DecodedMessage` shape (text, timestamp, sender, ids). A message it genuinely cannot read (no text and no usable blob) raises a `DecodeError`; the intent is to collect it like a parse error, but *as built* neither importer catches it, so one such message aborts the import (a known bug, pinned as `it.fails`). Timestamps are converted from Apple's Mac-epoch nanoseconds using BigInt arithmetic, because the raw values exceed JavaScript's safe-integer range.

### 3. Parsing — learned patterns, not hand-written parsers

Bank SMS are template output: a fixed sentence with values filled in. Rather than hand-writing a
regex parser per bank, Wealthi **learns** each bank's templates from your own messages. A separate
offline step (`npm run patterns:learn`) masks the values that have a recognisable shape (amounts,
currencies, dates, card digits, references), mines templates by lining up similar messages so free
text like a shop name reveals itself as the part that differs, labels each template with a
direction and slot roles, and writes the result to `backend/config/patterns/<bank>.json`. At import
time each message is matched against its bank's **enabled** patterns — nothing is inferred.

Two decisions carry the design. First, **the expensive, heuristic work happens once, offline, and a
human approves it**: learned patterns arrive disabled, you read and edit them as plain text, and
only then turn them on. Import itself is deterministic — a pattern either matches the whole message
or it doesn't. Second, **patterns are data, not code**, which is what makes the system survive
template drift: a bank rewording a message means re-running learn and approving a new pattern, not
editing a parser. Adding a bank is a config change. (The original per-bank parsers under
`services/parse/` have been deleted; switching to learned patterns recovered hundreds of
transactions they had silently never matched, including Arabic card purchases, InstaPay, ATM
withdrawals and refunds.)

A message no enabled pattern matches becomes a **collected parse error** rather than an exception:
one unrecognized template never aborts an import, and the failures are the to-do list for the next
learn run. A charge in a currency other than the account's is `skipped` deliberately, and is not
counted as an error. The account is not read from the message body either — a match yields a
`<bank>:<last4>` source key that `accountSources` in your config maps to one of your accounts.

See [PATTERNS.md](PATTERNS.md) and [PATTERNS-ALGORITHM.md](PATTERNS-ALGORITHM.md) for the algorithm.

### 4. Normalization — transactions and transfers

A parsed message becomes a `ParsedTransaction`: a positive `amount` in integer minor units (`Minor`, `utils/money.ts` — never a float) whose direction lives in a `type` discriminant (`debit`/`credit`), plus account, currency, merchant, the bank-reported balance when present, and the message's `guid` and `ROWID` linking it back to `chat.db`.

Internal transfers between your own accounts are then tagged by a **deterministic rule table**, not by amount-and-date guessing. The bank SMS already tells you where money landed (which account's feed it came from, plus the masked merchant string), so each rule maps a `(account, direction, merchant)` signature to the account on the other side and sets a `counterAccount`. A transfer is simply a normal debit or credit that *also* carries a `counterAccount` — there's no separate transaction variant. The payoff is that the same leg counts correctly in two places: it still moves the balance like any debit/credit, but it can be excluded from real spend/income so a transfer between your own accounts isn't mistaken for an expense.

### 5. The balance model — recomputable monthly snapshots

Balances are stored as one **materialized snapshot per account per month**: opening balance, summed debits/credits, transfers in/out, closing balance, and — when the SMS reported one — the bank's own balance plus the `discrepancy` against the computed figure. Closing is plain arithmetic: `opening − debits − transfersOut + credits + transfersIn`. Each month's closing becomes the next month's opening, forming a cascade.

The decision that shapes everything is that **balances are derived, never authoritative** — `transactions` is the source of truth, and a snapshot can always be recomputed from it. This matters because transactions get edited or arrive late: a single back-dated charge in March is wrong to patch in place, because it changes March's closing, which is April's opening, which ripples through every later month. So an import recomputes from the *earliest month it touched* forward to the present, and nowhere else — months before the change keep their stored snapshots untouched. Snapshots are written with **upsert**, because a recompute legitimately overwrites months that already have rows. (As built, the live `importer.ts` deletes both tables, re-inserts every parsed transaction, and computes balances only for a rolling window of recent months — seeded from `config.openingBalances`. Manual and recurring entries from config are stored in `transactions` alongside the parsed rows and counted in the balances; CSV entries are still counted in the balances only, never stored. The recompute-forward-from-earliest-touched-month design lives in `importer2.ts`. Also as built: `balance.ts` has `if (false) transfersOut += …`, so an outgoing transfer is counted in `debits` rather than `transfersOut`; the closing balance is still right, the split is not — a known bug pinned as `it.fails`.) Keeping the bank-reported balance alongside the computed one turns the SMS into a built-in audit signal: a non-zero `discrepancy` flags a missed or misparsed message.

### 6. The read/query layer

Reads never touch `chat.db` or recompute anything — they serve the stored ledger. Three endpoints carry the substance (plus `/api/accounts`, `/api/categories` and `/api/health`, which just expose config and liveness):

- **`/api/transactions`** — the transaction list, filterable by month, account, merchant substring, direction, transfer (`only`/`exclude`) and counter account, newest first. `PATCH /api/transactions/:id/category` sets a manual category on one row — the API's only write.
- **`/api/balances`** — the per-account snapshot for a given month, read straight from the materialized table.
- **`/api/spending`** — debit, non-transfer transactions for a month, grouped by category then merchant. A row's category is its manual `category` when set, else the `merchantCategories` lookup, else `Uncategorized` — always via `resolveCategory()`. Transfers are excluded by construction (they carry a `counterAccount`), so the breakdown reflects real outflow rather than money shuffled between your own accounts.

The React frontend is a thin client over these: three tabbed views (Transactions, Balances, Spending) sharing a selected month through the URL, with TanStack Query handling fetching and caching. The design line is a **clean read/write split** — the import pipeline is the only writer of amounts and balances, and the materialized snapshots do the heavy lifting, so the UI stays a simple, fast reader. The one exception, setting a category, is presentation-only and never triggers a recompute.

## Design principles / tradeoffs

A few decisions cut across the whole system:

- **Derived, recomputable state.** Transactions are the single source of truth; balances are a cache that can always be rebuilt. Late or edited data is handled by recomputing forward from the earliest affected month, not by in-place patches — correctness over cleverness. *As built:* recompute-forward lives in `importer2.ts`; the live importer rebuilds the last six months (see §5).
- **Idempotent imports.** Every SMS-derived row carries the message's stable `guid` under a unique constraint, so the same message can never be stored twice. In the cursor design (`importer2.ts`) the `ROWID` cursor advances inside the *same* database transaction as its inserts, so an interrupted or rolled-back import never leaves the cursor ahead of the data it represents. *As built:* the live importer is idempotent by deleting and rebuilding inside one transaction. `importer2.ts` has no duplicate handling — re-reading an already-imported message (a reset cursor, a VACUUMed `chat.db`) hits the unique constraint and aborts the import (a known bug, pinned as `it.fails`).
- **Local wall-clock time.** Month bucketing is a personal-finance concept ("what did I spend in March?"), which is inherently local, not UTC. Year-month keys are derived from local time so a transaction near midnight lands in the month the user actually experienced it.
- **Failure isolation.** Unrecognized templates and bad values are collected as parse errors and reported, never thrown. One malformed text can't abort an import of hundreds, and the collected failures are the to-do list for extending parser coverage. *(As built, an undecodable message is the exception — see §2.)*
- **Patterns as reviewed data, not code.** Bank SMS formats are external, inconsistent, and changing. Keeping each bank's templates in a config file that a human approves means absorbing a template change — or adding a bank entirely — is a config edit and a re-learn, never a code change. Heuristics stay offline; the import path stays deterministic.
