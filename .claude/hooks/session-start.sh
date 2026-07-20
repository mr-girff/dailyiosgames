#!/usr/bin/env bash
# =============================================================================
# session-start.sh — SessionStart hook: inject Git context into the session
# -----------------------------------------------------------------------------
# Runs once when a session begins. Emits the current branch, working-tree
# status and a short recent-change summary so the agent starts every session
# already aware of repo state and the work-trace rules.
#
# Output contract (Claude Code): print JSON on stdout with
#   { "hookSpecificOutput": { "hookEventName": "SessionStart",
#       "additionalContext": "<text injected into the model context>" } }
# Any plain stdout is also surfaced. Always exit 0 so startup never breaks.
# =============================================================================
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" 2>/dev/null || exit 0

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(detached)')"
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo 'none')"
DIRTY_COUNT="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
STATUS_SHORT="$(git status --porcelain 2>/dev/null | head -n 20)"
RECENT="$(git log --oneline -8 2>/dev/null)"
LAST_TRACE=""
if [ -f docs/work-trace/trace-log.md ]; then
  LAST_TRACE="$(grep -m1 -E '^## ' docs/work-trace/trace-log.md 2>/dev/null | sed 's/^## //')"
fi

# --- build the context block ------------------------------------------------
CTX="$(cat <<EOF
== Session Git Context (auto-injected) ==
Branch:        $BRANCH
Upstream:      $UPSTREAM
Uncommitted:   $DIRTY_COUNT file(s) changed
Last trace day: ${LAST_TRACE:-none yet}

Working-tree status (top 20):
${STATUS_SHORT:-  (clean)}

Recent commits:
${RECENT:-  (no history)}

== Work-Trace Rules (reminder) ==
* Every Write/Edit/MultiEdit is auto-logged to docs/work-trace/trace-log.md.
* This project follows "0% hand-written code + full work trace".
* Commits must be Conventional Commits and carry the AI-Assisted / Co-Authored-By trailer.
EOF
)"

# --- human-readable copy to stderr (visible in transcript) ------------------
printf '%s\n' "$CTX" 1>&2

# --- structured injection for the model -------------------------------------
if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CTX" \
    '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$ctx}}'
else
  # Manual JSON escaping fallback (newlines -> \n, quotes escaped).
  ESC="$(printf '%s' "$CTX" | sed ':a;N;$!ba;s/\\/\\\\/g;s/"/\\"/g;s/\n/\\n/g')"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ESC"
fi

exit 0
