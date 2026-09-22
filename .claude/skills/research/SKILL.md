---
name: research
description: "Turn an idea file into a work ticket. Input: an idea number N, read from .claude/ideas/IDEA<N>. Asks only blocking questions, then writes .claude/tasks/TASK<N>.md: context, acceptance criteria, interfaces, notes."
argument-hint: <N>
disable-model-invocation: true
---

You are writing a work ticket for a second agent that will write tests first, then implement. That agent has zero context from this session and cannot ask you anything.

Write it the way a senior engineer writes a ticket for a teammate. Short. No templates, no headers with nothing under them, no restating the idea back at me.

No implementation code. Signatures and schema deltas only.

## Inputs

1. Idea number `$0` (a bare number).
2. Read the idea at the first path that exists:
   - `.claude/ideas/IDEA<N>`
   - `.claude/ideas/IDEA<N>.md`

   If none exist, list the ideas directory and ask which one.

## Phase 1: Research

- Grep only for the files you will actually change and their existing shapes.
- Reading a file does not make it a touched file.

## Phase 2: Questions

- Only if a wrong guess would change the interface, the schema, or an acceptance criterion.
- Max 3, numbered, each with your recommended default so I can reply "defaults". Then stop and wait.
- No questions means no report. Go straight to Phase 3 in the same run.

## Phase 3: Ticket

Write `.claude/tasks/TASK<N>.md`. If it exists, ask before overwriting.

Target one screen, roughly 40 lines. If it runs much longer the idea is too big: stop and tell me to split it.

Four sections.

### Context

Two or three lines. The problem and why. Not a summary of the idea file.

### Acceptance criteria

- A numbered list. One line each, plain sentences, each one checkable by a test written before any code exists.
- State the observable outcome: the status code, the returned shape, the row written, the text shown.
- Error cases and side effects are criteria here, not their own sections.
- Never "correctly", "properly" or "as expected". No Given / When / Then.

### Interfaces

The new or changed endpoint (method, path, request, response), the page URL, and the role plus accessible name of every UI element a criterion observes. Typed signatures for new exported functions.

### Notes

Only what the implementing agent cannot work out from the code. Typically a few of:

- Schema delta: column, type, nullability, index, and how existing rows are backfilled
- Decisions I made in Phase 2, one line each, so they are not reopened
- The one gotcha that will bite: the race, the idempotency requirement, the ordering constraint
- Out of scope, if there is a real risk of the change sprawling
- Touched files, last, only if it is a short list

Skip anything that does not apply. A note that states the obvious is worse than no note.

## Rules

- Everything traces to the idea file, `AGENTS.md`, the code, or my answers.
- Ambiguity is asked, never guessed silently.
- The ticket stands alone.
- No em dashes.

## Output

After writing, print the path and one line on what it covers. Do not echo the file.
