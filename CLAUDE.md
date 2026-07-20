# CLAUDE.md — Agent Operating Rules

This file is read automatically by Claude Code (and honored by other agents that
support project instruction files). It defines the **work-trace contract** for
this repository.

> **Policy:** this project is built with **0% hand-written code + a full work
> trace**. Every change is made by an AI agent and automatically recorded.

---

## 0. Two-layer, model-agnostic trace

Trace works across **any model or tool** (Claude, GPT, Grok, a human, a script)
via two complementary layers:

1. **Agent layer (Claude Code only):** the `PostToolUse` hook in
   [`.claude/settings.json`](.claude/settings.json) logs each Write/Edit/MultiEdit
   in real time.
2. **Git layer (universal fallback):** [`.githooks/pre-commit`](.githooks/pre-commit)
   logs the staged diff at commit time — this fires **regardless of which model
   or tool made the change**, so GPT/Grok/other agents are covered too.

Enable the Git layer once after cloning: `bash .githooks/install.sh`
(sets `core.hooksPath=.githooks`).

Tag the model on each commit so the log records who did it:
`TRACE_MODEL=gpt|grok|claude git commit …` (defaults to `unknown` / `AI`).

## 1. Work-trace is mandatory

- Every file modification (`Write` / `Edit` / `MultiEdit`) triggers the
  `PostToolUse` hook defined in [`.claude/settings.json`](.claude/settings.json),
  which appends an entry to [`docs/work-trace/trace-log.md`](docs/work-trace/trace-log.md).
- **Never edit `docs/work-trace/trace-log.md` by hand.** It is append-only and
  machine-generated.
- If you disable or bypass the hook, you have violated the trace contract.
- Non-Claude tools (GPT, Grok, …) rely on the Git `pre-commit` layer above; the
  `prepare-commit-msg` hook auto-adds the `AI-Assisted` / `Co-Authored-By`
  trailer so their commits stay compliant.

## 2. Session start

- At session start the `SessionStart` hook injects current Git branch, status,
  and recent commits. Read that context before acting; do not re-run redundant
  `git status` / `git log` unless you need fresher detail.

## 3. Commits

When you (or the user) commit, the message **must**:

1. Follow [Conventional Commits](https://www.conventionalcommits.org/):
   `type(scope): subject` where `type` ∈
   `feat | fix | refactor | perf | docs | style | test | chore | ci`.
2. Include a short body summarising **what / how / caveats**.
3. Carry the AI-assistance trailer:

   ```
   AI-Assisted: true
   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

Generate a compliant message with:

```bash
git commit -F <(.claude/hooks/gen-commit-msg.sh)
```

If you commit with a plain message instead, the `.githooks/prepare-commit-msg`
hook auto-appends `AI-Assisted: true`, `AI-Model: <TRACE_MODEL>` and a matching
`Co-Authored-By` trailer — so all three (feat/fix/…) subjects still need to be
Conventional, but the trailer is handled for you.

## 4. Pull requests

- On every PR, [`.github/workflows/trace-summary.yml`](.github/workflows/trace-summary.yml)
  posts a trace + changelog summary and checks that all commits carry the
  AI-Assisted trailer. Do not merge if the trailer check fails.

## 5. Build / verify before committing code

- `npm run build` must pass before committing changes under `src/`.
- `npm run build` runs `astro build` only; it does **not** refresh `data/`.
  Data is refreshed exclusively by `.github/workflows/daily.yml`.

## 6. Do not commit

- `node_modules/`, `dist/`, `.astro/`, `public/img/`, `.env*` (see `.gitignore`).
- Local hook scratch files under `.claude/tmp/` and `*.trace.tmp`.

---

_This file is a template — extend it with project-specific rules as needed, but
keep sections 1–4 (the trace contract) intact._
