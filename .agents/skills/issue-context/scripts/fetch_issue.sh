#!/usr/bin/env bash
# fetch_issue.sh — Fetch a GitHub issue (metadata + body + full comment thread) as JSON.
#
# Usage:
#   fetch_issue.sh <issue-number-or-url> [--repo owner/name]
#
# Accepts a bare issue number (resolved against the current repo's default remote),
# a "#N" reference, or a full GitHub issue URL. Requires an authenticated `gh`.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: fetch_issue.sh <issue-number-or-url> [--repo owner/name]" >&2
  exit 64
fi

REF="${1#\#}" # strip a leading '#', if present
shift

REPO_ARG=()
if [[ "${1:-}" == "--repo" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "error: --repo requires an owner/name argument" >&2
    exit 64
  fi
  REPO_ARG=(--repo "$2")
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) not found. Install it and run 'gh auth login'." >&2
  exit 69
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh is not authenticated. Run 'gh auth login' first." >&2
  exit 77
fi

gh issue view "$REF" "${REPO_ARG[@]}" \
  --json number,title,state,author,labels,assignees,milestone,body,comments,url,createdAt,updatedAt,closedAt
