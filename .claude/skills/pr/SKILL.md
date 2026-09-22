---
name: pr
description: Generate a PR description for a task from its task file, its idea and all branch changes (committed, staged, unstaged, untracked).
argument-hint: <N>
disable-model-invocation: true
---

Read-only. Do not edit, stage, commit, or push anything.

## Gather

0. **Task:** read `.claude/tasks/TASK$0.md` and `.claude/ideas/IDEA$0.md` (or `IDEA$0`).
1. **Base:** `git symbolic-ref refs/remotes/origin/HEAD` for the default branch, fall back to `main` then `master`. Base commit is `git merge-base HEAD origin/<default>`.
2. **Commits:** `git log --format='%s%n%b' <base>..HEAD` for intent and conventions.
3. **Diff:** `git diff <base> -- . ':!.claude'` covers committed, staged, and unstaged changes in one pass.
4. **Untracked:** `git ls-files --others --exclude-standard -- . ':!.claude'`, read each new file.

Treat everything as one changeset. Read surrounding code only when a hunk is unclear.

## Rules

- **Title:** imperative, under 72 chars. Use a conventional commit prefix only if the repo's log uses one.
- **Context:** one paragraph, 2 to 4 sentences: what is being implemented and why. Take the why from the task and idea, then commits or code. Do not invent motivation; if the why is unknown, state only the what.
- **Changes:** one line per logical change. Group aggressively: a model, migration, service, and endpoint serving one feature are one line.
- Aim for 3 to 8 change lines. If more, group further.
- Skip unless it is the only change: formatting, import order, renames without behavior change, typo fixes, lockfile churn, generated files, snapshot updates.
- Tests get at most one line, only if they cover new behavior.
- Always call out: breaking changes, migrations, new env vars, config or dependency changes.
- No filler: no "This PR", no "Summary", no adjectives, no closing remarks, no emojis.

## Output

```
# <title>

<context paragraph>

## Changes

- <change>
- <change>
```

Print only the description. No preamble.
