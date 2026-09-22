# Wealthi — SMS Pattern Parsing: how it works

> Living doc for humans and AI assistants. It explains the algorithm and the reasons behind it, not every
> line of code. **Update it in the same change** whenever you alter behaviour in
> `backend/src/services/patterns/*`, `services/ingest/decode.ts`, `services/ingest/parser.ts`,
> `services/learn-patterns.ts`, the pattern file format or the importer wiring. Add a line to the changelog at the bottom.
> Short version: [PATTERNS.md](PATTERNS.md). Examples here are synthetic; never paste real SMS.

## 1. The problem

Bank SMS are template output: a fixed sentence with values filled in. Within one bank and one
message type, every SMS has the same shape:

```
Your Card ending **1234 has been charged with EGP1 500.00 at ACME STORE on 01.02.2025 10:30 PM and your Available Balance is 9 999.00 EGP
Your Card ending **1234 has been charged with EGP45.00 at Corner Cafe on 03.02.2025 09:12 AM and your Available Balance is 9 954.00 EGP
```

Some values have a recognisable shape (amounts, dates, card numbers). Free text does not
(shop names, people's names). The approach is:

1. mask what has a shape,
2. line messages up so the free text shows itself as the part that differs,
3. decide what each slot means,
4. save the result as an editable pattern that compiles to a regex.

Everything expensive and heuristic (steps 1–3) happens once, at **learn** time, and is reviewed by
a human. The **import** only runs the approved patterns, so parsing is deterministic.

## 2. File map

| File | Role |
|---|---|
| `services/ingest/decode.ts` | chat.db `attributedBody` → text (fixed decoder) |
| `services/patterns/mask.ts` | value rules, placeholder regexes, tokenizer |
| `services/patterns/mine.ts` | **wired**: token-count buckets → templates; owns `SLOT`, `Sequence`, `Template`, `messageCount` |
| `services/patterns/mine2.ts` | not wired: the older LCS miner, kept for templates `mine.ts` can't express (§6.5) |
| `services/patterns/label.ts` | transaction filter, direction, slot roles |
| `services/patterns/learn.ts` | mask → mine → label for one bank; stable ids |
| `services/patterns/pattern.ts` | pattern types, `{role:TYPE}` compiler, `extract()`, direction words |
| `services/patterns/store.ts` | read/validate/write pattern files, merge with existing, `bankOf()` |
| `services/ingest/parser.ts` | `DecodedMessage` → transaction / skipped / `ParseError` |
| `services/learn-patterns.ts` | CLI: read chat.db, learn every bank, merge, save, print summary |
| `services/importer.ts` | uses `decode` + `parser` (built by `createPatternParser` in `ingest/parser.ts`); runs on server start |

## 3. Decoding (`services/ingest/decode.ts`)

Messages either have a plain `text` column or an `attributedBody` blob in one of two formats.
An earlier decoder got the older format wrong; the current one fixes it (it was developed as
`decode-v2.ts` and has since replaced the original):

- **Format detection by header.** A blob with `streamtyped` in its first bytes is decoded as
  streamtyped. The earlier decoder looked for `NSString\x01` first, which streamtyped blobs also contain,
  so they were decoded as a binary plist and length bytes leaked into the text (`��+V…`), with
  archive bytes trailing it.
- **Streamtyped length.** After `NSString` comes a `0x2B` tag, then the length: one byte if it's
  below `0x81`, `0x81` + uint16 LE, or `0x82` + uint32 LE. The earlier decoder only read one byte.
- **Keyed archive terminator.** The text ends at the first U+FFFD, not at a literal `?`, which truncated
  any message containing a question mark.

Pattern matching needs clean text because patterns match the **whole** message (`^…$`).

## 4. Bank identity

`bankOf(sender)` slugifies the chat.db handle: `"ADCB Egypt"` → `adcb-egypt`. The slug is the file
name and the prefix of pattern ids and account keys. A pattern file lists its `senders`; the parser
chooses the file by exact sender match. Only senders in `bankSenders` (wealthi.json) are read.

## 5. Masking (`mask.ts`)

`mask(text)` normalizes the text (Arabic-Indic digits → ASCII, collapse whitespace), replaces values
with typed placeholders, and splits the result into tokens.

| Placeholder | Matches | Examples |
|---|---|---|
| `<URL>` | `http(s)://…` | links in promos |
| `<MASKED>` | masked card/account numbers | `**1234`, `***1234`, `XXX123`, `1234****`, `**a1b2c3d4` |
| `<CUR>` | `EGP USD EUR جم دولار` | |
| `<NUM>` | numbers, incl. `3 000.00`, `1,234,567`, `-160.19` | amounts, balances, plain account digits, phone numbers |
| `<DATE>` | `18.02.2024`, `27/08/2024`, `15-02-2024`, `03-FEB-26`, `24/02`, `7/6`, `12-12` (only before a time) | |
| `<TIME>` | `11:10 PM`, `0:57`, `23:8` | |
| `<ID>` | 6+ Latin alphanumerics mixing letters and digits | `55af9c13` |

**Rule order matters**, because earlier rules claim text first:
URL → MASKED → currency+number (`EGP 100`, then `100 EGP`) → full dates → times → short dates → ID → bare numbers.
Money comes before ID so `EGP383` isn't a reference. Full dates come before short dates, and short dates
before numbers, so `24/02` isn't read as two numbers. `<ID>` is Latin-only because Arabic text glues words to
digits (`المتاح87.01`).

**Tokenizing.** The text is split on whitespace. `, ، @ ( )` are split out wherever they appear, because
some banks glue them to template words (`@ATM`, `Branch,your`, `(Cash)All`). Other punctuation
(`. ; : ! ? – -`) is peeled off token edges only, so `talabat.com` survives but `ref 55af9c13.` loses the dot.
A literal `<WORD>` in an SMS (a promo's `<OFFER>`) has its brackets split off first, so it can't pass for a placeholder.

Masking only drives learning. The parser never masks; it runs compiled patterns on the raw text.

## 6. Mining (`mine.ts`)

Input: one bank's distinct masked sequences, `{tokens, count}` (`learn.ts` groups identical token lists, keeping their raw texts for labelling).
Output: templates, each with `elements` (tokens + `<TEXT>` slots) and its member sequences.

**The assumption.** Within one template exactly **one** run of tokens varies: the shop, or the
counterparty. Everything below follows from it, and §6.5 says what happens when it doesn't hold.

### 6.1 Buckets

Sequences are grouped by token count and processed most frequent first. Inside a bucket every
sequence lines up index to index, so there is no alignment search, no DP and no similarity
threshold: the positions where two sequences differ **are** the slot.

A sequence joins a cluster when the positions where it differs form **one contiguous run**, counting
positions already inside the cluster's slot. Everything between the outermost differences must itself
be a difference or already in the slot — a template word in between means a second thing varies, and
the merge is refused. `<NUM>` and `<ID>` count as equal (an all-digit reference masks as `<NUM>`);
a position holding one of each becomes `<ID>`, which matches both.

A slot is only allowed when it:

- covers at most `MAX_SLOT_SHARE` of the message, so two unrelated templates can't merge into one slot;
- leaves `MIN_ANCHORS` literal words outside it;
- absorbs no **blocking token** — `<CUR> <DATE> <TIME> <URL>`, or a `<MASKED>` whose previous word is
  an account word (`ending, account, card, card/account, no, id, ref, حساب, بطاقه, بطاقة, بـرقم`).
  This keeps amounts and card numbers out of a merchant, while letting `GEIDEA *1234` be free text.

### 6.2 Widening across buckets

One template spreads across buckets: a 1-word shop and a 3-word shop differ in token count. Two
templates that share a prefix and a suffix and differ only in the middle are therefore the same
template with a slot of a different width, and merge into `prefix <TEXT> suffix`. The prefix and
suffix are the longest that match under `<NUM>`/`<ID>` equality, and the middles must satisfy the
same three slot rules as above.

Merging is **refused when both middles hold the same literal word**. Two shop names of different
widths have nothing in common; a word present in both is a template word the slot would swallow
(`… transfer to NAME ref <ID>` vs `… payment SHOP ref <ID>` share `ref`). This runs to a fixed point.

### 6.3 Variant splitting

Buckets and widening compare tokens, so neither can tell free text from a template word: `transfer to
…` and `payment …` can merge into one slot. Free text takes hundreds of distinct values, a template
word takes two or three. So after merging, each slot's **first word** and **last word** are checked
across the members:

- If the edge word takes **2–3 distinct values** (`MAX_VARIANTS`) and **each value comes from ≥ 2
  distinct sequences** (`MIN_VARIANT_SUPPORT`), it's a template variant. The members are partitioned
  by that word and each partition is mined again, recursively, to `MAX_DEPTH`.
- A slot whose edge word has many values (shop names) stays a slot.
- The support rule stops a merchant seen in one message shape from passing for a variant. The
  trade-off: a rare second template (`payment` seen once) can't be told from a merchant, so the merge
  it caused survives — see §11.

This is what separates debit from credit when both end up in one template, and it usually yields two
plainly typed patterns where a `by-keyword` pattern would otherwise be needed.

### 6.4 Rescue

A template built from fewer than `MIN_SHAPES` distinct sequences saw no variation at all, so its shop
or counterparty is still in the template as literal words — a pattern that only ever matches that one
shop or person. If a bigger template's slot covers every one of its messages, they move there and the
small template disappears. The bigger template's `elements` don't change, so **its id is untouched**.

The fit test asks what the *compiled pattern* accepts, not how masking marked the tokens: an `<ID>`
slot matches any Latin alphanumeric word, while masking only writes `<ID>` for one mixing letters and
digits, so an all-letter reference is a literal token here and still parses.

### 6.5 The other miner (`mine2.ts`)

`mine2.ts` is the original miner and is **wired to nothing**. It clusters with a longest common
subsequence scored on literal overlap (`MIN_LITERAL_OVERLAP`, at most `MAX_SLOTS` slots per
template), which assumes nothing about how many things vary, so it can describe a template with
several independent slots — `at {merchant:TEXT} note {:TEXT}` — that `mine.ts` cannot express at all.
The cost is a similarity threshold to tune and slot boundaries that drift: on real data its merchant
slots absorbed neighbouring template words that `mine.ts` keeps out.

It is kept for message sets more varied than the three banks measured here, and it still owns its
`mineSequences` tests in `test/unit/mask-mine.test.ts`. It imports `SLOT`, `Sequence`, `Template` and
`messageCount` from `mine.ts`, which owns that vocabulary.

Measured over three banks, swapping it for `mine.ts` reproduced every pattern that carries money
(one bank identical, ids and all) and lost three low-volume templates where two things vary
independently.

## 7. Labelling (`label.ts`)

Takes a template plus the raw texts of its members. Returns a labelled pattern, or `null` for a
non-transaction.

### 7.1 Un-baking names

A counterparty that never varied gets mined as literal words (`from JOHN QUINCY PUBLIC with Ref`).
A run of **2+ all-caps Latin words right after `to`/`from`** (any case) is replaced by a slot. This keeps real
names out of pattern files. Arabic names can't be detected this way; they only become slots when they vary.

### 7.2 Is it a transaction? Which direction?

Checked on the template's literal words, in this order:

1. **Ignore words** → drop: `declined, rejected, OTP, password, outstanding balance, minimum,
   رفض, لم يتم, كشف حساب, نذكركم, لا يكفي`.
2. **Direction words** (in `pattern.ts`):
   credit = `credited, received, refunded, reversal, اضافة/إضافة, إلى حساب`;
   debit = `debited, charged, spent, successful transaction, sent, خصم, سحب`.
   If exactly one side matches, that's the `type`. If both or neither match, go to step 3.
3. If a **slot's values** contain a direction word, `type = by-keyword`, and that slot gets the
   `direction` role (read per message at parse time).
4. Otherwise → drop.
5. After roles are assigned, a template without an `amount` → drop.

### 7.3 Roles

First pass, **by context** (the word in front of each placeholder):

| Role | Rule |
|---|---|
| `reference` | `<MASKED>/<NUM>/<ID>` after `ref, ref#, id`; a `<TEXT>` after those words |
| `account` | first `<MASKED>` not already a reference; a `<NUM>` after `account, card, card/account, حساب, بطاقه, بطاقة` |
| `amount` + `currency` | each `<CUR>` pairs with the `<NUM>` right after it, else right before. It's the amount unless a balance word (`balance, bal, available, رصيد, الرصيد, المتاح, متاح`) is among the 4 words before the pair |
| `balance` | a money pair led by a balance word; or a bare `<NUM>` with a balance word among the 4 words before it |
| `date`, `time` | first `<DATE>`, `<TIME>` |
| `direction` | the slot chosen in 7.2 step 3 |
| `counterparty` | `<TEXT>` after `to/from` |
| `merchant` | `<TEXT>` after `at, in, @, payment`; or a `<TEXT>` right after a date/time (Arabic templates put the shop there) |

Each role is used at most once per pattern (first wins).

Second pass, **by values**: the template's compiled regex runs over its member texts (digit-normalised, as
masking and parsing are) to collect what every placeholder actually holds.

- An unlabelled `<NUM>/<ID>/<MASKED>` whose values are all 3–4 digits (optionally prefixed with `*`/`X`)
  with ≤ 3 distinct values → `account`, if there's no account yet (e.g. `… on 1234 on 01/08`).
- An unlabelled one whose values are ≥ 90% distinct over ≥ 3 messages → `reference`.
- Numbers right next to a `<CUR>` are skipped (money that didn't win the amount/balance pairing).
  A constant 5+ digit number (a hotline) stays unlabelled.
- If the pattern has no merchant or counterparty, the first unlabelled `<TEXT>` holding a value longer
  than 4 characters → `description` (e.g. `Cash`). Short varying words like `on`/`from` don't qualify.

### 7.4 Review notes

Added to `review` for a human to check:
- `matches N of its M messages`: the compiled pattern doesn't reproduce its own members.
- `no account slot`: the parser will fail these messages until the pattern is edited.
- `seen once`
- `unlabelled TEXT slot #k`: matched but unused. Usually harmless.

## 8. Pattern files

`backend/config/patterns/<bank>.json` (gitignored). `WEALTHI_PATTERNS_DIR` points `PATTERNS_DIR`
at another directory; the test suite uses it to load `backend/test/fixtures/patterns/`.

```json
{
  "bank": "example-bank",
  "senders": ["Example Bank"],
  "patterns": [
    {
      "id": "example-bank:3f2a9c1b0d",
      "enabled": true,
      "type": "debit",
      "pattern": "Your Card ending {account:MASKED} has been charged with {currency:CUR} {amount:NUM} at {merchant:TEXT} on {date:DATE} {time:TIME}",
      "generated": "…same as pattern unless edited…",
      "reason": "debit keyword in template text",
      "review": ["seen once"],
      "messages": 1
    }
  ]
}
```

| Field | Owner | Meaning |
|---|---|---|
| `id` | learn | `<bank>:<first 10 hex of sha1(mined template tokens)>`; `-2`, `-3` on collision |
| `enabled` | **you** | only enabled patterns parse; learn writes `false` and never changes it |
| `type` | you (initially learn) | `debit`, `credit`, or `by-keyword` |
| `pattern` | you (initially learn) | what the parser uses |
| `generated` | learn | what learn produces today; differs from `pattern` if you edited it |
| `reason`, `review`, `messages` | learn | refreshed every run |
| `missing` | learn | set when a run no longer produces this id; the entry is kept |

### 8.1 Pattern syntax

- Tokens are separated by spaces. A token is either a literal or a slot `{role:TYPE}`.
- `TYPE` ∈ `NUM CUR DATE TIME MASKED ID URL TEXT`. `role` ∈ `amount currency balance account merchant
  counterparty description reference date time direction`, or empty (`{:CUR}`: must be present, value unused).
  An unknown type or role makes the file fail to load, with the pattern id in the error.
- **Compile:** literals are regex-escaped; each slot becomes a capture group with its type's regex
  (`TEXT` = lazy `.*?`); tokens are joined with `\s*`; the whole thing is anchored with
  `^\s* … \s*$`, flags `su`. Because of `\s*`, `bal . {:CUR}` matches `bal.EGP`, and non-breaking
  spaces and newlines are fine. Merchants are captured from the original text, so spacing is kept exactly.
- **Editing tips:** to include a fixed prefix in the merchant, move the slot left
  (`- {merchant:TEXT} ref` instead of `- IPN payment {merchant:TEXT} ref`). To stop using a value,
  clear its role (`{:NUM}`). Keep enough literal words that the pattern can't match other templates.

### 8.2 Merge on re-learn (`store.ts`)

- Existing id → keep `enabled`, `type`, `pattern`; refresh `generated`, `reason`, `review`, `messages`.
  To take a fresh version, delete the entry and re-learn.
- New id → added with `enabled: false`.
- Id no longer produced → kept with `missing: true`, `messages: 0`.
- Sorted by message count, missing entries last. `senders` are unioned.
- Re-running learn on unchanged data produces byte-identical files (messages are read in `date, ROWID` order,
  so equal timestamps can't reorder sequences between runs).

A template's id changes when its mined tokens change (e.g. new data adds a slot, or masking or
tokenizing rules change). The old entry then becomes `missing` and the new one is disabled, so it
needs to be re-approved and any edits copied over.

## 9. Parsing at import (`pattern.ts` `extract` + `parser.ts`)

For each decoded message:

1. Find the pattern file by sender, or fail with `no pattern file for sender`.
2. Run every **enabled** pattern. If several match, the one with the **most literal tokens** wins
   (more specific). None → `no enabled pattern matched`.
3. Read values by role. `extract()` returns the amount and balance as raw text (ASCII digits);
   the parser reads them with `parseMinor` (`utils/money.ts`) into integer minor units without a float:
   whole units (plain, or 3-digit groups split by `,`/whitespace) + the fraction padded to 2 digits,
   parsed as one integer. `12.5` → 1250, `1,234.50` → 123450. A malformed number, or a non-zero third
   decimal place (`1.005`), is a `ParseError` rather than a rounded value.
   `merchant` = merchant, else counterparty, else description.
   `accountKey` = `<bank>:<last 4 digits of the account value>`.
   `type`: the pattern's type, or for `by-keyword` the direction words applied to the `direction` slot.
4. Checks, in order (a failure becomes a `ParseError` with the pattern id):
   type known → amount present → amount well-formed → currency known (`EGP/جم`, `USD/دولار`, `EUR`) →
   account digits present → `accountSources[accountKey]` exists. After the skip check below, a balance
   that is present must be well-formed too (`balance: invalid amount …`).
5. **Currency different from the account's currency → `skipped`**, not an error. The SMS doesn't say
   what a foreign charge cost in the account currency.
6. Otherwise return a `ParsedTransaction`: `transactedAt` = message date, `reportedBalance` = balance,
   `counterAccount` = null (transfer rules add it later).

`importer.ts` collects errors (except skipped ones), then runs `classifyTransfer` and balances as before.
Pattern files load once, when the parser module is imported.

## 10. Tuning knobs

| Constant | File | Default | Raise it → | Lower it → |
|---|---|---|---|---|
| `MIN_ANCHORS` | mine.ts | 2 | stricter merges, more templates | bigger slots, looser templates |
| `MAX_SLOT_SHARE` | mine.ts | 0.5 | a slot may cover more of a message | more templates |
| `MAX_VARIANTS` | mine.ts | 3 | more slot edges become variants | fewer splits |
| `MIN_VARIANT_SUPPORT` | mine.ts | 2 | rare variants stay inside slots | merchants may become literals |
| `MIN_SHAPES` | mine.ts | 3 | more small templates get rescued | more baked-in shop names |
| `MAX_DEPTH` | mine.ts | 8 | | |
| `MIN_LITERAL_OVERLAP`, `MAX_SLOTS` | mine2.ts | 0.6, 4 | only affects the unwired miner (§6.5) | |
| word lists | label.ts, pattern.ts | see §7 | add a bank's wording here | |

A change here usually changes template tokens, and so ids. Expect new disabled entries and `missing`
old ones after re-learning.

## 11. Known limitations

- **One varying run per template.** A template where two things vary independently (a merchant *and*
  a free-text reason) can't be expressed: it comes out as one template per combination, each with
  both values as literals. `mine2.ts` handles these; `mine.ts` does not (§6.5).
- Templates seen in fewer than `MIN_SHAPES` shapes keep their variable text as literals when no
  bigger template's slot covers them (e.g. a name that never varied). Edit the pattern.
- A rare second template that shares a prefix and suffix with a common one can be merged into its
  slot, because variant splitting needs each value in 2+ sequences to separate them (§6.3).
- A rare direction variant stays in a slot (`by-keyword`), which works only if the words are in the lists.
- Foreign-currency charges on local-currency accounts are skipped, not recorded.
- Messages without account digits (e.g. a loan disbursement) can't be mapped to an account.
- Transfer rules and merchant categories key on exact merchant strings; editing a pattern can
  change those strings and silently break the keys.
- Direction and ignore word lists cover English and Arabic templates seen so far; a new bank may
  need additions.

## 12. Tests

Vitest, `backend/test/unit/`. Use **synthetic SMS only**. `mine.test.ts` covers the wired miner
bucket by bucket (slot rules, widening, variant splitting, rescue); `mask-mine.test.ts` covers masking
plus `mine2.ts`'s `mineSequences`; both are also exercised end to end through `label.test.ts` and
`learn.test.ts`, which run mask → mine → label the way the CLI does.

The cases worth covering:
- masking
- template mining with a merchant slot
- debit/credit variant split
- stable ids
- dropping non-transactions
- name un-baking
- value-based account labelling
- extraction (exact merchant spacing, most-literals wins, by-keyword)
- compile validation
- merge semantics
- the decoder's streamtyped lengths and `?` handling

## 13. Maintenance checklist

When you change…
- **mask rules or tokenization** → update §5, expect id churn (§8.2), re-learn and re-approve.
- **mining thresholds or logic** → update §6 and §10.
- **labelling words or role rules** → update §7; add a synthetic test for the new wording.
- **pattern syntax or fields** → update §8, `PATTERNS.md`, and the `Pattern` type docs.
- **parser checks or skip rules** → update §9.
- **decoder** → update §3.

## Changelog

- 2026-09-17 — Initial version: decode-v2, learn pipeline, transaction-only pattern files with
  `enabled`, pattern parser wired into `importer.ts`, foreign-currency skip, `bank:last4` account keys.
- 2026-09-18 — Docs refresh: `decode-v2.ts` is now `services/decode.ts`; the per-bank
  `services/parse/` tree has been deleted; tests section corrected (none exist yet).
- 2026-09-18 — Moved the pipeline steps (`reader`, `decode`, `patterns/`, `transfer`, `balance`,
  CSV + manual entries) under `services/ingest/`; `importer*.ts` and `learn-patterns.ts` moved to `services/`.
- 2026-09-19 — Behaviour-preserving refactor of `learn.ts`, `mine.ts`, `label.ts`: sequences are
  deduplicated once in `learn.ts` (`mineTokens` → `mineSequences`), clustering prunes merges by literal
  count before the LCS and uses a boolean fit check, labelling filters ignore-words before compiling.
  Verified identical output against the previous version on all banks.
- 2026-09-19 — Fix: labelling now digit-normalises member texts before matching, as masking and `extract()`
  already did. A transaction SMS written with Arabic-Indic digits used to count as unmatched at learn time
  (spurious `matches N of M`, no values for the account/reference/direction heuristics).
- 2026-09-19 — Fixes: the cluster fit check now applies the account-number blocking rule that generalize
  already did, so `at card ending **1234` can't join a template with the number inside the merchant slot;
  name un-baking accepts `To`/`From` in any case, like the counterparty rule; a literal `<WORD>` in an SMS
  is tokenized as `< WORD >` instead of aborting the learn run; the reader orders by `date, ROWID` so equal
  timestamps can't reorder sequences. None changed the output on existing data.
- 2026-09-19 — Money in integer minor units: `extract()` returns amount/balance as raw text and the
  parser reads them with `parseMinor` instead of `parseFloat`. New `ParseError`s for a malformed amount
  or balance and for more than 2 non-zero decimal places. Patterns and learning are unchanged.
- 2026-09-20 — New miner wired. `mine.ts` now groups sequences by token count and reads the slot off
  the positions that differ (§6.1–6.4); the LCS miner it replaces moved to `mine2.ts`, unwired and
  under review (§6.5), which is also where the `mineSequences` unit tests now point. `mine.ts` owns
  `SLOT`, `Sequence`, `Template` and `messageCount`. Measured on three banks: every money-carrying
  pattern reproduced, one bank identical id for id; three low-volume templates with two varying runs
  lost. `mine.test.ts` covers the new miner directly. Three `label.test.ts` cases moved with it: the
  ordering one no longer asserts a tie-broken order, the `by-keyword` one builds a slot mining can't
  split so it still reaches that branch, and the two-varying-runs one is now `it.fails`, pinning the
  §11 limitation.
- 2026-09-22 — Docs refresh: `patterns/` lives at `services/patterns/`, beside `ingest/` rather than
  inside it (the 2026-09-18 entry predates that); the decoder header note dropped; changelog re-sorted; `services/ingest/parser.ts` added to the
  header's update-this-doc list, matching AGENTS.md.
