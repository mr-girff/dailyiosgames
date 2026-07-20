#!/usr/bin/env bash
# =============================================================================
# gen-commit-msg.sh — generate a Conventional Commit message from the diff
# -----------------------------------------------------------------------------
# Helper (not a hook). Run it before committing to produce a ready-to-use
# Conventional Commit message that:
#   * infers type (feat/fix/refactor/docs/chore/ci/test/style) from paths,
#   * lists the changed files as a short body,
#   * appends the work-trace summary + AI-Assisted / Co-Authored-By trailer.
#
# Usage:
#   .claude/hooks/gen-commit-msg.sh                 # prints message to stdout
#   git commit -F <(.claude/hooks/gen-commit-msg.sh)
#
# It reads STAGED changes if any exist, otherwise the full working-tree diff.
# =============================================================================
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" 2>/dev/null || exit 1

# Prefer staged changes; fall back to unstaged.
FILES="$(git diff --cached --name-only 2>/dev/null)"
DIFF_SRC="--cached"
if [ -z "$FILES" ]; then
  FILES="$(git diff --name-only 2>/dev/null)"
  DIFF_SRC=""
fi

if [ -z "$FILES" ]; then
  echo "chore: no changes detected" >&2
  exit 1
fi

# --- infer conventional-commit type from changed paths ----------------------
infer_type() {
  local f="$1"
  case "$f" in
    *.md|docs/*|README*|CLAUDE.md)                 echo docs ;;
    .github/*|*.yml|*.yaml)                         echo ci ;;
    *test*|*spec*)                                  echo test ;;
    *.css|public/styles*|*palette*)                echo style ;;
    package.json|package-lock.json|.gitignore|.claude/*) echo chore ;;
    src/pages/*|src/components/*|src/content/*)    echo feat ;;
    scripts/*|src/lib/*|functions/*)               echo refactor ;;
    *)                                              echo chore ;;
  esac
}

# Tally types to pick the dominant one.
declare -A COUNTS
while IFS= read -r f; do
  [ -z "$f" ] && continue
  t="$(infer_type "$f")"
  COUNTS["$t"]=$(( ${COUNTS["$t"]:-0} + 1 ))
done <<< "$FILES"

TYPE="chore"; MAX=0
for t in "${!COUNTS[@]}"; do
  if [ "${COUNTS[$t]}" -gt "$MAX" ]; then MAX="${COUNTS[$t]}"; TYPE="$t"; fi
done

# --- infer a scope from the top-level dir of the first file -----------------
FIRST="$(printf '%s\n' "$FILES" | head -n1)"
SCOPE="$(printf '%s' "$FIRST" | cut -d/ -f1)"
case "$SCOPE" in
  src) SCOPE="$(printf '%s' "$FIRST" | cut -d/ -f2)";;
  .github) SCOPE="ci";;
  .claude) SCOPE="trace";;
esac
[ -z "$SCOPE" ] && SCOPE="repo"

FILE_COUNT="$(printf '%s\n' "$FILES" | grep -c . )"
STAT="$(git diff $DIFF_SRC --shortstat 2>/dev/null | sed 's/^ *//')"

# --- subject line -----------------------------------------------------------
SUBJECT="$TYPE($SCOPE): update $FILE_COUNT file(s)"

# --- body: file list + change summary ---------------------------------------
BODY_FILES="$(printf '%s\n' "$FILES" | sed 's/^/- /')"

# --- emit the full message --------------------------------------------------
cat <<EOF
$SUBJECT

Changed files:
$BODY_FILES

Trace: ${STAT:-see docs/work-trace/trace-log.md}
Generated with AI assistance; full change trace in docs/work-trace/trace-log.md.

AI-Assisted: true
Co-Authored-By: Claude <noreply@anthropic.com>
EOF

exit 0
