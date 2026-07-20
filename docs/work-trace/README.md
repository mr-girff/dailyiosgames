# Work Trace

This directory holds the **automated work-trace** for the project.

- [`trace-log.md`](./trace-log.md) — append-only log of every file
  modification, grouped by UTC date. Written automatically by **two layers**:
  - the Claude Code `PostToolUse` hook
    ([`.claude/hooks/log-trace.sh`](../../.claude/hooks/log-trace.sh)), and
  - the **model-agnostic** Git `pre-commit` hook
    ([`.githooks/pre-commit`](../../.githooks/pre-commit)), which covers GPT,
    Grok, or any other tool that ends in `git commit`.

## How it works

1. **Claude Code:** an agent edits a file with `Write`/`Edit`/`MultiEdit`; the
   `PostToolUse` hook fires and appends a dated entry in real time.
2. **Any model/tool (GPT, Grok, …):** at `git commit`, the `pre-commit` hook
   reads the staged diff and appends a dated entry, then re-stages the log so it
   lands in the same commit.
3. Both compute a `git diff` summary and record **what** changed, **how**, the
   source model (`TRACE_MODEL`) and any notes.

## Rules

- `trace-log.md` is **generated** — never edit it by hand.
- Commits touching real code should be Conventional Commits and carry the
  `AI-Assisted: true` / `Co-Authored-By` trailer (see
  [`../../CLAUDE.md`](../../CLAUDE.md)).
- On pull requests, [`.github/workflows/trace-summary.yml`](../../.github/workflows/trace-summary.yml)
  posts a summary of the trace + changelog delta.
