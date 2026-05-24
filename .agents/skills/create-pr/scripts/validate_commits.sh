#!/usr/bin/env bash
# validate_commits.sh — Pre-PR commit validator
# Checks every commit between <base> and HEAD for Arcane conventions.
#
# Usage: bash validate_commits.sh [base-branch]
#   base-branch defaults to "main"
#
# Output: one line per problem, exit 0 = all good, exit 1 = failures found.

set -euo pipefail

BASE=${1:-main}
FAILED=0

commits=$(git rev-list --no-merges "${BASE}..HEAD" 2>/dev/null)

if [[ -z ${commits} ]]; then
  echo "OK  no commits found between ${BASE} and HEAD"
  exit 0
fi

while IFS= read -r sha; do
  short=$(git log -1 --no-show-signature --format="%h" "${sha}")
  subject=$(git log -1 --no-show-signature --format="%s" "${sha}")
  body=$(git log -1 --no-show-signature --format="%b" "${sha}")

  # 1. Symbol format: type[scope]: Subject  (ADR-010, replaces Gitmoji)
  # Valid types: + - ~ ! = ^ > < @ $ ? * and breaking variants +! ~! -!
  if ! echo "${subject}" | grep -qE '^([+\-~!=^><@$?*]|[+~-]!)\[[a-z:,._-]+(,[a-z:,._-]+)*\]: [A-Z].+'; then
    echo "FAIL [${short}] subject — expected 'type[scope]: Subject' (symbol format)"
    echo "     got: ${subject}"
    FAILED=1
  else
    echo "OK   [${short}] subject format"
  fi

  # 2. GPG signature
  if git verify-commit "${sha}" 2>/dev/null; then
    echo "OK   [${short}] GPG signature"
  else
    echo "FAIL [${short}] GPG signature missing — amend with: git commit --amend -S"
    FAILED=1
  fi

  # 3. Signed-off-by — USER must add this (DCO, not AI responsibility)
  if echo "${body}" | grep -q "^Signed-off-by:"; then
    echo "OK   [${short}] Signed-off-by present"
  else
    echo "WARN [${short}] Signed-off-by missing"
    echo "     → USER ACTION: git rebase ${BASE} --exec 'git commit --amend -s --no-edit'"
    # Not setting FAILED — this is a user responsibility, surfaced for awareness
  fi

  # 4. Assisted-by trailer
  if echo "${body}" | grep -q "^Assisted-by:"; then
    echo "OK   [${short}] Assisted-by trailer"
  else
    echo "FAIL [${short}] Assisted-by trailer missing"
    echo "     Add 'Assisted-by: <provider>:<model-id>' to the commit body"
    FAILED=1
  fi

done <<<"${commits}"

echo ""
if [[ ${FAILED} -eq 0 ]]; then
  echo "✓ All checks passed"
else
  echo "✗ Some checks failed — fix before opening the PR"
fi

exit "${FAILED}"
