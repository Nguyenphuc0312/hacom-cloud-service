#!/usr/bin/env bash
set -euo pipefail

remote="${1:-origin}"
git fetch --no-tags "$remote" main develop

if git merge-base --is-ancestor "$remote/main" "$remote/develop"; then
  echo "OK: $remote/develop contains all $remote/main history."
  exit 0
fi

# GitHub's "Create a merge commit" strategy creates a commit that exists only
# on main when merging develop -> main. That commit is not an ancestor of
# develop, but the two branches are still synchronized when their trees match.
# Keep accepting that harmless graph-only divergence while still rejecting a
# direct hotfix or any other content that has not been brought back to develop.
if git diff --quiet "$remote/main" "$remote/develop"; then
  echo "OK: $remote/main and $remote/develop have identical content; only merge history differs."
  exit 0
fi

echo "ERROR: develop is missing content from main."
git log --oneline "$remote/develop..$remote/main"
exit 1
