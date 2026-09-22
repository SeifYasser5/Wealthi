---
name: build
description: Plan then implement a task file until its test passes. Pass no-test to skip the test gate.
argument-hint: <N> [no-test]
arguments: n mode
disable-model-invocation: true
---

## Mode

If `$mode` is `no-test`, run in no-test mode: skip the Test section and every test run below. Everything else applies unchanged.

## Inputs

Read `docs/TESTING.md` and `.claude/tasks/TASK$n.md`.

- If `TASK$n.md` is missing, stop.
- If `docs/TESTING.md` is missing, stop. In no-test mode, continue without it.

## Test

Skip this section in no-test mode.

- Find the test for this task: the test file added or modified by the most recent commit touching the test directories `docs/TESTING.md` names.
- If that is ambiguous, list the candidates and ask.
- If there is no test, stop and tell me to run `/test $n`.
- Run it with the command in `docs/TESTING.md`. It must fail on the missing behaviour.
- If it passes, or fails on setup, stop and report which.

## Phase 1: Plan

Read only what you will change and what you will reuse. Reading a file does not make it a touched file.

Output in chat, plain text, under 25 lines, no prose outside these sections:

- **Build:** numbered steps, one line each, each an action on a named file or symbol. What the code does, not why.
- **Reuse:** existing functions, services, helpers or migrations you will call instead of writing new ones, with paths. State if any needs a change to be reusable here, and what the change is.
- **Files:** every file you will create or edit, one per line, path then `create` or `edit` then three or four words on what changes. Include every code file that must change together with a touched file. Docs and `AGENTS.md` belong to update-context.

Then stop and wait for approval. Do not write code in this phase.

## Phase 2: Implement

Only after approval. Append a `## Build files` section to the end of `.claude/tasks/TASK$n.md` with the approved Files list, one path per line. Change nothing else in that file. If the section already exists, stop and ask.

### Scope

- Build only what the acceptance criteria require.
- No refactors, no renames, no reformatting, no unrelated fixes, no files outside the approved list.
- If you find a real defect outside scope, name it in the output and leave it.
- If implementation needs a file that is not in the approved list, stop, name the file and the reason in one line, and wait.

### Reuse

- Reuse over duplication: call the existing thing.
- If the change you need would alter behaviour for an existing caller, stop and report instead.

### Tests

- Never edit, delete, rename, skip or weaken a test file, test helper, factory or fixture.
- If the test looks wrong, stop and say why. Do not work around it.
- Never special-case test input, hardcode an expected value, or branch on the environment to make an assertion pass.
- In no-test mode, do not create tests either.

### Conventions

- Do not add a library that is not already in the repo.

### Run

- Run the task's test until it is green. Skip in no-test mode.
- Never run schema or migration commands except against a test database the test setup creates. If the task needs one run anywhere else, stop and tell me. `npx prisma generate` is codegen, not a schema command: run it after editing `schema.prisma`.
- Do not run the full suite, build, typecheck or lint: that is the verify stage.
- If it is not green after three attempts, stop. Report the failing assertion, its criterion number, and what you think is wrong.

## Output

Output only: the files created and edited, one per line, the test run command and its result (or `no-test: skipped`), and any deviation from the approved plan.
