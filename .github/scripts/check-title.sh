#!/usr/bin/env bash
# check-title.sh — Validate an issue or PR title is sentence-form English.
#
# Usage:
#   TITLE="…" KIND="PR|issue" bash check-title.sh
#
# Rejects:
#   - Commit symbol format prefix:   "+[scope]: …", "![…]: …", "~![…]: …", etc.
#   - Gitmoji shortcode prefix:      ":wrench: …", ":sparkles:(scope): …"
#   - Empty titles
#
# Sentence-case, length, and trailing-period rules are left to human review —
# this script catches the two anti-patterns that mechanical formatting can
# unambiguously detect.

set -euo pipefail

TITLE="${TITLE-}"
KIND="${KIND:-title}"

if [[ -z $TITLE ]]; then
  echo "::error title=Empty title::The $KIND title is empty. Provide a sentence describing the change."
  exit 1
fi

# 1. Reject commit symbol format: <type>[!]?[scope]: …
#    Types: + - ~ ! = ^ > < @ $ ? *  with optional breaking marker '!'
if grep -qE '^[-+~!=^><@$?*]!?\[' <<<"$TITLE"; then
  cat >&2 <<MSG
::error title=Use a sentence-form title::The $KIND title uses the commit symbol format (e.g. '+[scope]: Subject').
On issues and PRs, type and scope live in labels — the title is a plain English sentence.
See .agents/skills/create-issue/SKILL.md and .agents/skills/create-pr/SKILL.md.
Got: ${TITLE}
MSG
  exit 1
fi

# 2. Reject gitmoji shortcode prefix: ":word:" at start
if grep -qE '^:[a-z0-9_-]+:' <<<"$TITLE"; then
  cat >&2 <<MSG
::error title=Drop the gitmoji prefix::The $KIND title starts with a gitmoji shortcode (':something:').
Use a plain English sentence; type and scope live in labels.
See .agents/skills/create-issue/SKILL.md and .agents/skills/create-pr/SKILL.md.
Got: ${TITLE}
MSG
  exit 1
fi

echo "✓ $KIND title is sentence-form: \"$TITLE\""
