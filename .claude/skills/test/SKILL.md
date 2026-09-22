---
name: test
description: Write the one highest-layer test for a task file
argument-hint: <N>
disable-model-invocation: true
---

Do not write, scaffold or stub implementation code. Do not create the route, handler, model or migration under test.

## Inputs

Read `docs/TESTING.md` and `.claude/tasks/TASK$0.md`.

- If `TASK$0.md` is missing, stop.
- If `docs/TESTING.md` is missing, stop.

## Layer

- Write one test file at the highest layer `docs/TESTING.md` names. Add any seed or fixture data the test needs in the files `docs/TESTING.md` names; build cannot edit them. If you change shared seed or fixture data, run that layer's full suite. Every other test must still pass.
- Drop a layer only if a criterion cannot be observed there, and say which criterion forced it.
- If a criterion cannot be observed at any layer without new implementation code, stop and name it.

## Cases

- One test case. Drive the flow once and assert every acceptance criterion inside it, in order.
- Add a second case only when a criterion needs a precondition that contradicts the first case, such as a failure path that cannot follow a success.
- Never a case per criterion. Never a describe block per criterion.

## Assertions

- Tag each assertion with the criterion number it covers as a trailing comment. Every criterion must appear.
- Assert only the observable thing the criterion states: the status code, the returned shape, the row written.
- No assertions the criteria do not ask for. No assertions on internal calls.

## Harness

- Use the harness and stubs named in `docs/TESTING.md`.
- Do not add a library that is not already in the repo.

## Run

- Run the test. It must fail on an assertion or on the missing behaviour, not on a syntax error or a broken import in the test itself.
- Fix the test until the failure is the right one. If it fails on setup (Docker, database, stack start), stop and report the error. Stop after three attempts.

## Output

Output only: the file path, the layer chosen, the run command, and the first failing assertion with its criterion number.
