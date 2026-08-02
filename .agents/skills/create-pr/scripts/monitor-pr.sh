#!/usr/bin/env bash
# monitor-pr.sh — Post-creation PR watcher
# Polls a PR for new issue comments, review comments, and reviews, plus its
# open/closed/merged state. Emits one line per event (for use as a Monitor
# tool event stream) and exits once the PR leaves the OPEN state.
#
# Usage: bash monitor-pr.sh <pr-number> [poll-seconds]
#   poll-seconds defaults to 60 (stay above GitHub API rate-limit concerns)

set -euo pipefail

pr_number=${1:?usage: monitor-pr.sh <pr-number> [poll-seconds]}
poll_seconds=${2:-60}
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)

while true; do
  # Captured before this iteration's API calls, not after -- an event posted
  # mid-iteration is still >= poll_start, so the next iteration's `since`
  # filter is guaranteed to include it instead of skipping it.
  poll_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  state=$(gh pr view "${pr_number}" --repo "${repo}" --json state --jq .state)
  if [[ ${state} != "OPEN" ]]; then
    echo "[state] PR #${pr_number} is now ${state}"
    exit 0
  fi

  # Issue-style comments (the main PR conversation thread)
  gh api "repos/${repo}/issues/${pr_number}/comments?since=${since}" \
    --jq '.[] | "[comment] \(.user.login): \(.body | gsub("\n";" "))"' || true

  # Inline review comments (attached to a diff line)
  gh api "repos/${repo}/pulls/${pr_number}/comments?since=${since}" \
    --jq '.[] | "[review comment] \(.user.login) on \(.path):\(.line // .original_line): \(.body | gsub("\n";" "))"' || true

  # Review submissions (APPROVED / CHANGES_REQUESTED / COMMENTED with a body)
  # -- no `since` support on this endpoint, filter client-side instead. Piped
  # through jq directly (not `gh api --jq`, which doesn't accept --arg).
  gh api "repos/${repo}/pulls/${pr_number}/reviews" | jq -r --arg since "${since}" \
    '.[] | select(.submitted_at > $since and (.body != "" or .state != "COMMENTED")) | "[review \(.state)] \(.user.login): \(.body | gsub("\n";" "))"' || true

  since=${poll_start}
  sleep "${poll_seconds}"
done
