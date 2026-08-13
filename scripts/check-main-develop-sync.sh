#!/usr/bin/env bash
set -euo pipefail

remote="${1:-origin}"
git fetch --no-tags "$remote" main develop

if ! git merge-base --is-ancestor "$remote/main" "$remote/develop"; then
  echo "ERROR: develop is missing commits from main."
  git log --oneline "$remote/develop..$remote/main"
  exit 1
fi

echo "OK: $remote/develop contains all $remote/main history."
