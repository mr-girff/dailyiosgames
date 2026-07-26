# AGENTS.md — tool-neutral agent contract

Same contract as [`CLAUDE.md`](CLAUDE.md), for agents that read `AGENTS.md`
(Codex, Cursor, Aider, Copilot Workspace, Gemini CLI, ...). The file was committed
empty, so non-Claude tools had no rules to follow — this is the content.

## 1. Work-trace is mandatory

- Enable the git layer once per clone: `bash .githooks/install.sh`
  (sets `core.hooksPath=.githooks`). It logs the staged diff on **every** commit,
  whichever model or tool produced it.
- Tag the model so the log records who did the work:
  `TRACE_MODEL=gpt|grok|claude|codex git commit ...` (defaults to `unknown`).
- Automated, non-authored commits skip tracing: `TRACE_SKIP=1 git commit ...`
- Never hand-edit `docs/work-trace/trace-log.md`. It is append-only and generated.

## 2. Commits

- Conventional Commits: `type(scope): subject`, `type` in
  `feat | fix | refactor | perf | docs | style | test | chore | ci`.
- Body summarises **what / how / caveats**.
- Trailers `AI-Assisted: true` + `Co-Authored-By:` are appended automatically by
  `.githooks/prepare-commit-msg`; PR CI verifies them.

## 3. Verify before committing

```bash
npm run verify          # astro build + scripts/check_build.mjs
```

`npm run check` fails on broken internal links, sitemap/route drift and missing
canonicals. Do not commit changes under `src/`, `public/` or `scripts/` without
it passing. `.github/workflows/build.yml` runs the same thing on every PR.

## 4. Data rules

- `npm run build` renders from the JSON already committed in `data/`; it never
  refreshes data. Only `.github/workflows/daily.yml` writes `data/`.
- `data/enriched.json` `all[]` is the **persistent catalogue** (every game ever
  seen), not just today's charts — see `scripts/lib/catalog.mjs`. Never make the
  site render only the active set again: dropping an entry 404s a live URL.
- Regenerate locally without network access with `npm run enrich && npm run velocity`
  (both work purely from the committed snapshots).

## 5. Do not commit

`node_modules/`, `dist/`, `.astro/`, `public/img/`, `.env*`, `.claude/tmp/`,
`*.trace.tmp`. Never hardcode account ids, tracking ids or API keys in `src/` —
read them from `import.meta.env.PUBLIC_*` (see `.env.example`).
