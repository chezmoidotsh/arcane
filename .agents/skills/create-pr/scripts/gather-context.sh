#!/usr/bin/env bash
# gather-context.sh — Pre-PR context gatherer
# Prints branch name, issue number, push status, commits since base, files
# changed, and untracked/unstaged files in one pass. Run before drafting the
# PR body so the whole draft comes from one consistent snapshot.
#
# Usage: bash gather-context.sh [base-branch]
#   base-branch defaults to "main"

set -euo pipefail

BASE=${1:-main}
BRANCH=$(git branch --show-current)
# Matches the "issue-<number>/<desc>" branch naming convention (see SKILL.md).
ISSUE_NUM=$(echo "${BRANCH}" | grep -oE '^issue-[0-9]+' | grep -oE '[0-9]+' || true)
REMOTE_STATUS=$(git status -sb | head -1)

echo "┌─────────────────────────────────────────┐"
echo "│  PR Context                              │"
echo "└─────────────────────────────────────────┘"
echo "Branch : ${BRANCH}"
if [[ -n ${ISSUE_NUM} ]]; then
  echo "Issue  : #${ISSUE_NUM}"
else
  echo "Issue  : (none — branch has no issue-<number>/ prefix)"
fi

# Push status
if echo "${REMOTE_STATUS}" | grep -q '\[ahead'; then
  AHEAD=$(echo "${REMOTE_STATUS}" | grep -oE 'ahead [0-9]+' | awk '{print $2}')
  echo "Push   : ${AHEAD} commit(s) not yet pushed — run: git push -u origin ${BRANCH}"
elif ! echo "${REMOTE_STATUS}" | grep -q '\.\.\.'; then
  echo "Push   : branch not on remote yet — run: git push -u origin ${BRANCH}:${BRANCH}"
else
  echo "Push   : up to date with remote"
fi

echo "┌─────────────────────────────────────────┐"
echo "│  Commits since ${BASE}"
echo "└─────────────────────────────────────────┘"
git --no-pager log "${BASE}..HEAD" --oneline

echo "┌─────────────────────────────────────────┐"
echo "│  Files changed                           │"
echo "└─────────────────────────────────────────┘"
git --no-pager diff "${BASE}...HEAD" --stat

echo "┌─────────────────────────────────────────┐"
echo "│  Untracked / unstaged files              │"
echo "└─────────────────────────────────────────┘"
git status --short | grep -v '^[MA] ' || echo "(none)"
