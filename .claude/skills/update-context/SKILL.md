---
name: update-context
description: Update AGENTS.md, docs/ and the README.md sections AGENTS.md names from the branch's changes for a task. Manual stage after pr.
argument-hint: <N>
disable-model-invocation: true
---

Edit only `AGENTS.md`, the docs in `docs/`, and the `README.md` sections the `AGENTS.md` docs table names, following each file's existing style. Never touch code, tests or other files. Do not ask questions.

## Inputs

- `AGENTS.md`, the docs in `docs/` and `README.md`
- `.claude/tasks/TASK$0.md`. If missing, stop.
- `git diff $(git merge-base HEAD origin/main)` and untracked files, excluding `.claude/`. If empty, print `CONTEXT: TASK$0 UNCHANGED` and stop.

## Rules

- Context covers modules, shared code, conventions and constraints. Feature behaviour is not context.
- Stale line (now false): rewrite it, same length.
- Very small change with no similar items in the context: skip.
- Otherwise: add one entry to the matching section, same format and length as its sibling entries.
- No new sections, no reformatting, no edits to unrelated lines.
- If no section fits, report it and skip.

## Output

```
CONTEXT: TASK<N> UNCHANGED | UPDATED
Skipped: <item>: <reason>
Diff:
<git diff AGENTS.md docs/ README.md>
```
