---
name: verify
description: Run typecheck, lint, tests and build read-only and report PASS, FAIL or SKIPPED per check. Manual stage after build turns the task's test green.
argument-hint: <N>
disable-model-invocation: true
---

Read-only. Do not edit files or run `--fix`, `--write`, formatters, or codemods.

The changed files are `git diff --name-only HEAD` plus `git ls-files --others --exclude-standard`, excluding `.claude/`.

## Checks

Run all checks even if one fails.

1. **Typecheck:** every package's typecheck command in `AGENTS.md` Commands, run from that package, plus root `npm run typecheck:e2e`. None listed: SKIPPED.
2. **Lint:** same, with each package's lint command from `AGENTS.md`, without `--fix`. Backend also runs `npm run format:check`.
3. **Tests:** every package's test command from `AGENTS.md` plus root `npm run test:e2e`, full by default. If one exceeds 120s or has already timed out this session, run only tests covering the changed files plus their direct importers, and record the scope as touched-only.
4. **Build:** each package's build command from `AGENTS.md`, full by default. If it exceeds 120s, kill it and record SKIPPED.
5. **Diff report:** list changed files that are not in the `## Build files` section of `.claude/tasks/TASK$0.md`, and listed files not changed. Never a FAIL.

## Rules

- Do not propose fixes or explain causes.

## Output

One line per check:

```
<check> | <package> | PASS|FAIL|SKIPPED | <exact command> | <full|touched-only>
```

- For each FAIL: failing test name, rule id, or type error with file and line, plus the first 20 lines of output verbatim.
- Then the diff report as two lists: unexpected, missing.
- End with `VERIFY PASS` or `VERIFY FAIL`. PASS only if checks 1 to 4 are PASS, or SKIPPED because no command is listed.
