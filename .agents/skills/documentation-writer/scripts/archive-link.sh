#!/usr/bin/env bash
# Prints the link for the "Texte intégral" section of an archive: the last version of a document on the trunk, before
# it was archived or moved. The link is absolute: GitHub reads a link that starts with "/" from the repository root at the
# current branch, not from the site root.
#   https://github.com/<owner>/<repo>/blob/<sha>/<path>
#
# The commit comes from the trunk (origin/main by default), not from the working branch: a branch commit disappears at
# the squash merge, a trunk commit stays.
#
# Usage: archive-link.sh <path of the original file> [ref]
set -euo pipefail

path=${1:?usage: archive-link.sh <path of the original file> [ref]}
ref=${2:-origin/main}

sha=$(git rev-list -1 "${ref}" -- "${path}")
[[ -n ${sha} ]] || { echo "no commit of ${ref} touches ${path}" >&2; exit 1; }

# The last commit that touches the path may be the one that deleted or moved it: the text is in its parent.
git cat-file -e "${sha}:${path}" 2>/dev/null || sha=$(git rev-parse "${sha}^")
git cat-file -e "${sha}:${path}" 2>/dev/null || { echo "${path} does not exist at ${sha}" >&2; exit 1; }

slug=$(git remote get-url origin | sed -E 's#(\.git)?/?$##; s#^.*[:/]([^/]+/[^/]+)$#\1#')

echo "[\`${path}\`](https://github.com/${slug}/blob/${sha}/${path})"
date=$(git -c log.showSignature=false log -1 --format=%cs "${sha}")
echo "commit \`${sha:0:8}\`, ${date}" >&2
