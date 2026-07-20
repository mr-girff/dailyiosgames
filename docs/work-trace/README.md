# Work Trace

This directory holds the **automated work-trace** for the project.

- [`trace-log.md`](./trace-log.md) — append-only log of every AI file
  modification, grouped by UTC date. Written automatically by the
  `PostToolUse` hook in [`.claude/settings.json`](../../.claude/settings.json)
  → [`.claude/hooks/log-trace.sh`](../../.claude/hooks/log-trace.sh).

## How it works

1. An AI agent (Claude Code or any agent that honors `.claude/settings.json`)
   edits a file with `Write` / `Edit` / `MultiEdit`.
2. The `PostToolUse` hook fires and runs `log-trace.sh`.
3. The script reads the tool payload, computes a `git diff` summary and
   appends a dated entry describing **what** changed, **how**, and any notes.

## Rules

- `trace-log.md` is **generated** — never edit it by hand.
- Commits touching real code should be Conventional Commits and carry the
  `AI-Assisted: true` / `Co-Authored-By` trailer (see
  [`../../CLAUDE.md`](../../CLAUDE.md)).
- On pull requests, [`.github/workflows/trace-summary.yml`](../../.github/workflows/trace-summary.yml)
  posts a summary of the trace + changelog delta.
