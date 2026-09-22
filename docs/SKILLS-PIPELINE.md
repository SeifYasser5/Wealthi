# Skills pipeline

> **For humans only. Agents: do not read this file.** It describes the agent pipeline for the people
> who run and maintain it. Agents get their instructions from the skills themselves
> (`.claude/skills/<name>/SKILL.md`), `AGENTS.md` and the other docs.
>
> **Keep this in sync.** Any change to a skill under `.claude/skills/` (or to the files and sections
> they read and write) updates this file in the same change, so it stays the up-to-date description of
> how the pipeline works and why.

## Overview

One feature moves through six slash commands, all keyed by the same number `N`:

```
IDEA<N>  →  /research N  →  /test N  →  /build N  →  /verify N  →  /update-context N  →  /pr N
 (you)      TASK<N>.md      failing test  green test   report        docs + AGENTS.md      PR text
```

Every skill has `disable-model-invocation: true`: an agent never starts a stage on its own. You run
each one by hand, read its output, and decide whether to move on. Each stage starts cold, so all
state passes through files, never through chat.

| Stage | Reads | Writes | Stops for you when |
|---|---|---|---|
| `research` | `.claude/ideas/IDEA<N>[.md]`, code, `AGENTS.md` | `.claude/tasks/TASK<N>.md` | a guess would change interface/schema/criteria (max 3 questions); ticket would exceed ~1 screen; file exists |
| `test` | `docs/TESTING.md`, `TASK<N>.md` | one test file (+ seed/fixture data) | a criterion can't be observed without implementation code; setup fails; 3 attempts |
| `build` | `docs/TESTING.md`, `TASK<N>.md`, the task's test | code; `## Build files` section in `TASK<N>.md` | after the plan (approval); a file outside the plan is needed; test looks wrong; 3 attempts |
| `verify` | `AGENTS.md` Commands, `## Build files` | nothing (read-only) | never; it reports |
| `update-context` | branch diff, `TASK<N>.md`, `AGENTS.md`, `docs/`, `README.md` | `AGENTS.md`, `docs/`, named `README.md` sections | never; it does not ask questions |
| `pr` | `TASK<N>.md`, `IDEA<N>`, commits, branch diff, untracked files | nothing (prints the description) | never |

## The stages

### 1. research: idea → ticket

Turns your rough idea into a ticket for an agent with zero context. It greps only for the files that
will change, asks at most three blocking questions (each with a recommended default, so you can reply
"defaults"), then writes `TASK<N>.md` with four sections:

- **Context**: 2–3 lines, the problem and why.
- **Acceptance criteria**: numbered, one observable outcome each (status code, shape, row, text),
  every one testable before code exists. No "correctly", no Given/When/Then.
- **Interfaces**: endpoints, page URLs, role + accessible name of observed UI elements, typed
  signatures. No implementation code.
- **Notes**: only what the code can't tell you (schema delta, decisions from the questions, the one
  gotcha, out of scope, touched files).

Target ~40 lines. If it grows past that, the idea is too big and it tells you to split it. The
criteria numbers are the thread through the rest of the pipeline.

### 2. test: ticket → one failing test

Writes **one** test file at the highest layer `docs/TESTING.md` names (dropping a layer only when a
criterion forces it, and saying which). Usually one test case that drives the flow once and asserts
every criterion in order, each assertion tagged with its criterion number in a trailing comment. A
second case only when a precondition contradicts the first (e.g. a failure path).

It never writes implementation code, not even a stub route. It runs the test and it must fail **on
the missing behaviour**, not on a syntax error or bad import. Seed/fixture data goes in here, because
build is forbidden from touching it.

### 3. build: plan, approve, implement

Finds the task's test (the test file in the most recent commit touching the test dirs), confirms it
fails for the right reason, then:

- **Phase 1, plan** (under 25 lines): Build steps, Reuse (existing code to call), Files (every file to
  create/edit). Then it **waits for your approval**.
- **Phase 2, implement**: appends the approved list as `## Build files` in `TASK<N>.md`, implements
  only what the criteria require, and runs only the task's test until green (max 3 attempts).

Hard rules: never edits or weakens a test/fixture/helper, never special-cases test input, no new
libraries, no refactors or out-of-scope fixes (it names defects and leaves them), no schema commands
outside the test DB (`npx prisma generate` is allowed). Docs are left to update-context. The full
suite, lint, typecheck and build are left to verify.

`/build N no-test` skips the test gate and all test runs, for changes a test can't sensibly cover.

### 4. verify: read-only gate

Runs, from `AGENTS.md` Commands, every package's typecheck (+ `typecheck:e2e`), lint (+ backend
`format:check`), tests (+ `test:e2e`) and build. All checks run even if one fails. Nothing is fixed
or explained. Slow steps degrade instead of hanging: tests over 120s fall back to touched-only
(changed files and their direct importers), build over 120s is SKIPPED.

It also diffs the changed files against `## Build files` (unexpected / missing). That is
informational, never a FAIL. Ends with `VERIFY PASS` or `VERIFY FAIL`.

### 5. update-context: keep agent context current

Edits only `AGENTS.md`, `docs/` and the `README.md` sections the `AGENTS.md` docs table names, from
the branch diff against `origin/main`. It records modules, shared code, conventions and constraints,
not feature behaviour. It rewrites stale lines at the same length, adds one entry per real change in
the matching section, and never adds sections or reformats. Anything with no fitting section is
reported as skipped. Output: `CONTEXT: TASK<N> UNCHANGED | UPDATED` plus the doc diff.

### 6. pr: description

Read-only. Reads the task, the idea, the commits and the whole branch changeset (committed, staged,
unstaged, untracked, excluding `.claude/`) and prints a title (imperative, under 72 chars), a 2–4
sentence context paragraph (the why taken from task/idea, never invented) and 3–8 grouped change
lines. It always calls out breaking changes, migrations, env vars, config and dependency changes. It
does not commit, push or open the PR; you do.

## Design principles

These are the ideas the skills share. Keep them when changing a skill.

- **Files are the handoff.** `IDEA<N>` → `TASK<N>.md` → test file → `## Build files`. No stage relies
  on chat memory from an earlier one.
- **Criteria are the spine.** Numbered in research, tagged on assertions in test, reported by number
  in build failures.
- **Test before code, and the test is fixed.** test can't write code; build can't touch tests. That
  split is what keeps "make it green" honest.
- **Human gates at the expensive decisions.** research questions, build plan approval, and every
  stage transition.
- **Bounded effort.** Three attempts, then stop and report. Size caps (ticket ~40 lines, plan 25 lines,
  PR 3–8 lines) keep output reviewable.
- **Separation of duties.** build doesn't lint/typecheck/document; verify doesn't fix; update-context
  doesn't touch code; pr doesn't touch git.
- **Terse, fixed output formats**, so you can scan each result quickly.

## Known gaps and quirks

Worth knowing when running the pipeline, and a starting list for improving it.

- **Order of update-context and pr.** This doc lists update-context before pr, but
  `update-context`'s own description says "Manual stage after pr". Running it before pr means the doc
  changes show up in the PR description; pick one and align the skill description.
- **The test must be committed before build.** build locates the test via "the most recent commit
  touching the test directories", but test doesn't commit. Commit the test yourself between the two
  stages, or build finds the wrong file (or none).
- **verify's diff is against `HEAD`.** If you commit build's changes before verifying, the changed
  file list (and the Build files diff report) comes up empty. update-context and pr diff against the
  merge-base with `origin/main` instead.
- **This file lives in `docs/`.** update-context reads and edits "the docs in `docs/`", so it can pick
  this file up despite the header. Excluding `docs/SKILLS-PIPELINE.md` in that skill would enforce the
  humans-only rule.
- **`verify` names commands indirectly** ("from `AGENTS.md` Commands"). If `AGENTS.md` Commands
  drifts, verify drifts with it; that is intended, but keep that section accurate.
- **`.claude/ideas/` and `.claude/tasks/` are working files**, excluded from every diff the skills
  take. Decide whether they are committed or gitignored.

## Changing the pipeline

1. Edit the skill in `.claude/skills/<name>/SKILL.md`.
2. If it changes what a stage reads or writes, check the neighbouring stages that consume it (e.g.
   renaming `## Build files` breaks verify's diff report).
3. Update this file in the same change: the overview table, the stage section, and the gaps list
   (remove a gap you fixed, add one you introduced).
