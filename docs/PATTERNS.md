# Wealthi — SMS Pattern Parsing (brief)

> Living doc. If you change anything under `backend/src/services/patterns/`, `services/ingest/decode.ts`,
> `services/ingest/parser.ts`, `services/learn-patterns.ts` or the pattern file format, update this file and
> [PATTERNS-ALGORITHM.md](PATTERNS-ALGORITHM.md) in the same change.

## What it is

Wealthi no longer has a hand-written regex parser per bank (the old `services/parse/` tree is gone). It **learns** each bank's SMS
templates from your own messages, writes them to a config file you can read and edit, and the
importer **parses with those files**.

A learned pattern looks like this:

```
Your Card ending {account:MASKED} has been charged with {currency:CUR} {amount:NUM}
at {merchant:TEXT} on {date:DATE} {time:TIME} and your Available Balance is {balance:NUM} {:CUR}
```

Literal words must match; `{role:TYPE}` slots capture values. You can edit the pattern text by hand,
and you can turn each pattern on or off.

## Why

- Per-bank regex parsers were brittle and missed templates. Switching added 912 transactions they
  never parsed, including Arabic card purchases, InstaPay, ATM withdrawals and refunds.
- Adding a bank used to mean writing code. Now it means running learn and approving patterns.
- Bank SMS layouts aren't personal, but the messages are. Patterns and your data stay in gitignored config.

## How it works (one paragraph)

`npm run patterns:learn` reads bank SMS from `chat.db`, decodes them, and groups them by bank.
It **masks** values it can recognise on its own: amounts, currencies, dates, card numbers and references.
It **mines** templates by grouping messages with the same token count and comparing them position by
position; where messages differ, the template gets a slot (that's how shop names are found without
knowing them in advance), and buckets whose slot is only a different number of tokens wide are merged. It then **labels** each template:
debit or credit, and which number is the amount vs the balance. Templates that aren't transactions
(OTPs, declines, statements, promos) are dropped. The result is merged into
`backend/config/patterns/<bank>.json`. New patterns are added disabled, and your edits are kept.
At import, each message is matched against its bank's **enabled** patterns. The account comes from
`accountSources["<bank>:<last4>"]` in `wealthi.json`.

```
LEARN   chat.db → decode → group by bank → mask → mine → label → merge → config/patterns/<bank>.json
IMPORT  chat.db → decode → pattern parser (enabled patterns) → transfers → balances → Postgres
```

## Where things live

| What                                                      | Where                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Engine (mask, mine, label, pattern format, store)         | `backend/src/services/patterns/`                                               |
| Miner `learn.ts` runs                                     | `backend/src/services/patterns/mine.ts` (token-count buckets)                  |
| More general miner, not wired, under review               | `backend/src/services/patterns/mine2.ts` (LCS alignment)                       |
| Import-time parser                                        | `backend/src/services/ingest/parser.ts`                                               |
| Learn script                                              | `backend/src/services/learn-patterns.ts` (`npm run patterns:learn`)                     |
| Decoder used by learn + import                            | `backend/src/services/ingest/decode.ts`                                               |
| Importer wiring (runs on server start)                    | `backend/src/services/importer.ts`                                                      |
| Incremental importer variant (not wired)                  | `backend/src/services/importer2.ts`                                                     |
| Pattern files (gitignored)                                | `backend/config/patterns/<bank>.json` (`WEALTHI_PATTERNS_DIR` overrides the dir) |
| Test fixture patterns (synthetic, committed)              | `backend/test/fixtures/patterns/test-bank.json`                                |
| Account mapping (gitignored)                              | `accountSources` in `backend/config/wealthi.json`, keys like `adcb-egypt:1234` |
| Open decisions (gitignored, private notes; agents don't read them) | `backend/config/patterns/TRANSFERS-TODO.md`                  |
| Tests                                                     | `backend/test/unit/` (`mine`, `mask-mine`, `label`, `learn`, `store`, `pattern`) |

## Day-to-day workflow (and adding a bank)

Human-only: these steps read the real `chat.db` and edit real config. Adding a bank needs no code.

1. New bank only: add its SMS sender handle to `bankSenders` in `config/wealthi.json`.
2. `cd backend && nvm use 22 && npm run patterns:learn`.
3. Open `config/patterns/<bank>.json` and read the new patterns (`enabled: false`), especially their `review` notes.
4. Fix a pattern by editing its `pattern` text if needed, then set `"enabled": true`.
5. Run the import (the server does it on start) and check the reported parse errors.
6. If the import reports `no account mapped for source "<bank>:<last4>"`, add that key to `accountSources`.
7. If the config shape changed, add placeholder keys to `config/wealthi.example.json`.

## Rules to keep in mind

- **Only enabled patterns parse.** Learn never enables a pattern and never overwrites one you already have.
- **No match is an error, not a guess.** OTPs, promos and new templates show up as `no enabled pattern matched`.
- **Charges in a currency other than the account's are skipped** (e.g. USD on an EGP card).
- **Merchant strings are exact**, because categories and transfer rules key on them. Editing a pattern
  can change merchant strings, which breaks those keys.
- **No real SMS, names or card digits** in code, tests or committed docs. A counterparty who never
  varies can still be mined as literal text — read a new pattern before enabling it.
- **Two miners.** `mine.ts` is wired and assumes one varying run per template. `mine2.ts` is the older,
  more general LCS variant, kept for message sets that need several slots in one template; it is under
  review and wired to nothing. Both must keep passing `npm run test:unit`.

For the full algorithm, thresholds, file format and limitations, see [PATTERNS-ALGORITHM.md](PATTERNS-ALGORITHM.md).
