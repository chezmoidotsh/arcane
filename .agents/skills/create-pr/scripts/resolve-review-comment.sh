#!/usr/bin/env bash
# resolve-review-comment.sh — Reply to and resolve one inline review comment
# Posts a threaded reply to a specific PR review comment, then marks its
# review thread resolved. Only applies to inline review comments (attached
# to a diff line) -- top-level PR conversation comments have no resolve
# concept on GitHub.
#
# Usage: bash resolve-review-comment.sh <pr-number> <comment-id> <reply-body>
#   comment-id is the REST "databaseId" of the inline comment (the id shown
#   by `gh api repos/<owner>/<repo>/pulls/<pr>/comments`), not the thread id.

set -euo pipefail

pr_number=${1:?usage: resolve-review-comment.sh <pr-number> <comment-id> <reply-body>}
comment_id=${2:?usage: resolve-review-comment.sh <pr-number> <comment-id> <reply-body>}
reply_body=${3:?usage: resolve-review-comment.sh <pr-number> <comment-id> <reply-body>}

# comment_id gets interpolated into a jq filter below (gh api --jq has no
# --arg passthrough); reject anything non-numeric here so a bad id fails
# fast with a clear message instead of a cryptic jq parse error downstream.
[[ ${pr_number} =~ ^[0-9]+$ ]] || {
  echo "pr-number must be numeric, got: ${pr_number}" >&2
  exit 1
}
[[ ${comment_id} =~ ^[0-9]+$ ]] || {
  echo "comment-id must be numeric, got: ${comment_id}" >&2
  exit 1
}

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=${repo%%/*}
name=${repo##*/}

gh api "repos/${repo}/pulls/${pr_number}/comments/${comment_id}/replies" -f body="${reply_body}" --jq '.id'

# $owner/$repo/$pr below are GraphQL variables (bound via -f/-F), not shell
# variables -- the query must stay single-quoted.
# shellcheck disable=SC2016
thread_id=$(gh api graphql -f query='
  query($owner:String!, $repo:String!, $pr:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:100) {
          nodes { id comments(first:100) { nodes { databaseId } } }
        }
      }
    }
  }' -f owner="${owner}" -f repo="${name}" -F pr="${pr_number}" \
  --jq ".data.repository.pullRequest.reviewThreads.nodes[] | select(any(.comments.nodes[]; .databaseId == ${comment_id})) | .id")

if [[ -z ${thread_id} ]]; then
  echo "No review thread found starting at comment ${comment_id} -- reply posted, nothing to resolve" >&2
  exit 0
fi

# $threadId below is a GraphQL variable too, see above.
# shellcheck disable=SC2016
gh api graphql -f query='
  mutation($threadId:ID!) {
    resolveReviewThread(input:{threadId:$threadId}) { thread { id isResolved } }
  }' -f threadId="${thread_id}" --jq '.data.resolveReviewThread.thread'
