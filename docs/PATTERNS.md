# Wealthi — SMS Pattern Parsing (brief)

> Living doc. If you change anything under `backend/src/services/patterns/`, `services/ingest/decode.ts`,
> `services/ingest/parser.ts`, `services/learn-patterns.ts`, `db/patterns.ts` or the pattern storage, update this file and
> [PATTERNS-ALGORITHM.md](PATTERNS-ALGORITHM.md) in the same change.

## What it is

Wealthi no longer has a hand-written regex parser per bank (the old `services/parse/` tree is gone). It **learns** each bank's SMS
templates from your own messages, stores them in the `sms_patterns` table for you to review on the
**Learn** page, and the importer **parses with the ones you enabled**.

A learned pattern looks like this:

```
Your Card ending {account:MASKED} has been charged with {currency:CUR} {amount:NUM}
at {merchant:TEXT} on {date:DATE} {time:TIME} and your Available Balance is {balance:NUM} {:CUR}
```

Literal words must match; `{role:TYPE}` slots capture values. You turn each pattern on or off on the
Settings → Learn; its text is read-only there, because editing it can change merchant strings.

## Why

- Per-bank regex parsers were brittle and missed templates. Switching added 912 transactions they
  never parsed, including Arabic card purchases, InstaPay, ATM withdrawals and refunds.
- Adding a bank used to mean writing code. Now it means running learn and approving patterns.
- Bank SMS layouts aren't personal, but the messages are. Patterns live in your local Postgres, next to
  the transactions, never in git.

## How it works (one paragraph)

**Learn patterns** in Settings → Learn (`POST /api/patterns/learn`) reads bank SMS from `chat.db`, decodes
them, and groups them by bank (`bankOf(sender)`).
It **masks** values it can recognise on its own: amounts, currencies, dates, card numbers and references.
It **mines** templates by grouping messages with the same token count and comparing them position by
position; where messages differ, the template gets a slot (that's how shop names are found without
knowing them in advance), and buckets whose slot is only a different number of tokens wide are merged. It then **labels** each template:
debit or credit, and which number is the amount vs the balance. Templates that aren't transactions
(OTPs, declines, statements, promos) are dropped. The result is stored in `sms_patterns`: a pattern
whose id isn't stored yet is added **pending**, and the page offers only those for review. You tick the
ones to enable and confirm; the rest are saved **disabled**, so they are never offered as new again and
can be enabled later from the Disabled tab. A stored pattern keeps its status and text on every relearn.
Each import builds its parser from the **enabled** rows, so a change applies to the next import with no
restart. The account comes from the `account_sources` table (Settings → Sources): `<bank>:<last4>` maps to one.

```
LEARN   chat.db → decode → group by bank → mask → mine → label → store new as pending → sms_patterns
REVIEW  Settings → Learn: tick → enabled, the rest → disabled   (PATCH /api/patterns)
IMPORT  chat.db → decode → pattern parser (enabled rows) → transfers → balances → Postgres
```

## Where things live

| What                                                      | Where                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Engine (mask, mine, label, pattern format, seed-file loader) | `backend/src/services/patterns/`                                            |
| Miner `learn.ts` runs                                     | `backend/src/services/patterns/mine.ts` (token-count buckets)                  |
| More general miner, not wired, under review               | `backend/src/services/patterns/mine2.ts` (LCS alignment)                       |
| Import-time parser                                        | `backend/src/services/ingest/parser.ts`                                               |
| Learn run                                                 | `backend/src/services/learn-patterns.ts`, behind `services/run-learn.ts` (one at a time) |
| Pattern store (learn, review, enabled rows for the parser) | `backend/src/db/patterns.ts`, table `sms_patterns` (`prisma/schema.prisma`) |
| API                                                       | `backend/src/routes/patterns.ts`: `GET /api/patterns`, `POST /api/patterns/learn`, `PATCH /api/patterns` |
| Settings → Learn (learn, review, Enabled/Disabled tabs)          | `frontend/src/pages/SettingsPage/components/` (Learn*.tsx, Pattern*.tsx)|
| Decoder used by learn + import                            | `backend/src/services/ingest/decode.ts`                                               |
| Importer wiring (Settings → `POST /api/import`)          | `backend/src/services/importer.ts`                                                      |
| Incremental importer variant (not wired)                  | `backend/src/services/importer2.ts`                                                     |
| Seed pattern files (synthetic, committed)                 | `backend/demo/patterns/demo-bank.json` (loaded by `seedDemo()`), `backend/test/fixtures/patterns/test-bank.json` (loaded by `resetDatabase()` and the e2e seed) |
| Account mapping                                           | the `account_sources` table (Settings → Sources), keys like `adcb-egypt:1234`; seeded once from `accountSources` in `backend/config/wealthi.json` (gitignored) |
| Open decisions (gitignored, private notes; agents don't read them) | `backend/config/patterns/TRANSFERS-TODO.md`                  |
| Tests                                                     | `backend/test/unit/` (`mine`, `mask-mine`, `label`, `learn`, `store`, `pattern`, `learn-patterns`, `run-learn`), `test/integration/patterns.test.ts`, `frontend/test/pages/learn.test.tsx`, `e2e/learn.spec.ts` |

## Day-to-day workflow (and adding a bank)

Human-only: these steps read the real `chat.db` and edit real config. Adding a bank needs no code.

1. New bank only: add its SMS sender handle on the **Settings** page, under *Senders* (no restart needed).
2. Open the **Learn** page and click **Learn patterns**. It reports how many new patterns it found, or
   *Nothing new found*.
3. Read each new pattern in **Review new patterns**, especially its *Check before enabling* notes. None start
   selected: click a card to select it, then click **Enable N patterns** (**Disable all** if none are
   selected). The unselected ones are saved disabled.
4. Run the import from **Settings → Import** and check the reported parse errors.
5. If the import reports `no account mapped for source "<bank>:<last4>"`, map that key to an account on the **Settings** page, under *Sources*.
6. If the config shape changed, add placeholder keys to `config/wealthi.example.json`.

The table starts empty: until patterns are learned and enabled, an import parses nothing (every message
is `no enabled pattern matched`, and the stored ledger is kept). A pattern's text can't be edited from the
page; one that needs a fix stays disabled until learn produces a better one.

## Rules to keep in mind

- **Only enabled patterns parse.** Learn never enables a pattern and never changes the status or text of one
  already stored. The import is a full rebuild, so disabling a pattern drops its transactions at the next import.
- **No match is an error, not a guess.** OTPs, promos and new templates show up as `no enabled pattern matched`.
- **Charges in a currency other than the account's are skipped** (e.g. USD on an EGP card).
- **Merchant strings are exact**, because categories and transfer rules key on them. A different pattern
  for the same template can change merchant strings, which breaks those keys.
- **No real SMS, names or card digits** in code, tests or committed docs. A counterparty who never
  varies can still be mined as literal text — read a new pattern before enabling it.
- **Two miners.** `mine.ts` is wired and assumes one varying run per template. `mine2.ts` is the older,
  more general LCS variant, kept for message sets that need several slots in one template; it is under
  review and wired to nothing. Both must keep passing `npm run test:unit`.

For the full algorithm, thresholds, storage and limitations, see [PATTERNS-ALGORITHM.md](PATTERNS-ALGORITHM.md).
