#!/usr/bin/env bash
#
# Captures screenshots of frontend changes and posts them to the PR.
# Designed to run as a Claude Code PostToolUse hook (async).
#
# Prerequisites: agent-browser, gh, jq, curl
# The user's Chrome must be running with --remote-debugging-port=9222
# and the dev server must be running on localhost:3000.
#
set -euo pipefail

cleanup() {
  agent-browser --session "$SESSION" close 2>/dev/null || true
  [[ -d "${SCREENSHOT_DIR:-}" ]] && rm -rf "$SCREENSHOT_DIR"
}

SESSION="pr-shots-$$"
SCREENSHOT_DIR=""
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Parse hook context
# ---------------------------------------------------------------------------
HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null) || true
BASH_CMD=$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || true

# Trigger after commit-push-pr skill OR a git push / gh pr create via Bash
if [[ "$TOOL_NAME" == "Skill" ]]; then
  [[ "$SKILL_NAME" == *"commit-push-pr"* ]] || exit 0
elif [[ "$TOOL_NAME" == "Bash" ]]; then
  [[ "$BASH_CMD" == *"git push"* || "$BASH_CMD" == *"gh pr create"* ]] || exit 0
else
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Preflight checks
# ---------------------------------------------------------------------------
command -v agent-browser &>/dev/null || { echo "agent-browser not found, skipping" >&2; exit 0; }
command -v gh &>/dev/null            || exit 0
command -v jq &>/dev/null            || exit 0

BRANCH=$(git branch --show-current)
PR_NUMBER=$(gh pr view "$BRANCH" --json number -q '.number' 2>/dev/null) || exit 0
[[ -n "$PR_NUMBER" ]] || exit 0

FRONTEND_CHANGES=$(git diff origin/staging --name-only -- 'app/' 'components/' 'emails/' 2>/dev/null || true)
[[ -n "$FRONTEND_CHANGES" ]] || exit 0

curl -sf -o /dev/null --max-time 3 http://localhost:3000 || { echo "Dev server not reachable, skipping" >&2; exit 0; }

# ---------------------------------------------------------------------------
# 3. Determine pages to capture
# ---------------------------------------------------------------------------
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
SCREENSHOT_DIR="/tmp/pr-screenshots-${PR_NUMBER}-$$"
rm -rf "$SCREENSHOT_DIR"
mkdir -p "$SCREENSHOT_DIR"

declare -a PAGES=()
declare -a LABELS=()

PAGES+=("http://localhost:3000")
LABELS+=("Homepage")

if echo "$FRONTEND_CHANGES" | grep -q 'app/(public)/e/'; then
  PAGES+=("http://localhost:3000/e/fintech-ai-buildathon")
  LABELS+=("/e/[slug] (public event)")
fi

if echo "$FRONTEND_CHANGES" | grep -q 'app/(public)/e/\[slug\]/manage'; then
  PAGES+=("http://localhost:3000/e/fintech-ai-buildathon/manage")
  LABELS+=("/e/[slug]/manage (organizer)")
fi

if echo "$FRONTEND_CHANGES" | grep -q 'app/(dashboard)/'; then
  PAGES+=("http://localhost:3000/hackathons")
  LABELS+=("/hackathons (dashboard)")
fi

# ---------------------------------------------------------------------------
# 4. Capture screenshots via agent-browser
# ---------------------------------------------------------------------------
for i in "${!PAGES[@]}"; do
  url="${PAGES[$i]}"
  slug=$(echo "$url" | sed 's|https\?://[^/]*/||;s|/|_|g;s|^$|index|')

  agent-browser --auto-connect --session "$SESSION" open "$url" 2>/dev/null || continue
  agent-browser --session "$SESSION" wait --load networkidle 2>/dev/null || true
  sleep 1
  agent-browser --session "$SESSION" screenshot --full "$SCREENSHOT_DIR/${slug}.png" 2>/dev/null || continue
done

agent-browser --session "$SESSION" close 2>/dev/null || true

shopt -s nullglob
SCREENSHOTS=("$SCREENSHOT_DIR"/*.png)
shopt -u nullglob
[[ ${#SCREENSHOTS[@]} -gt 0 ]] || exit 0

# ---------------------------------------------------------------------------
# 5. Upload to a draft GitHub release
# ---------------------------------------------------------------------------
TAG="pr-${PR_NUMBER}-screenshots"

if ! gh release view "$TAG" &>/dev/null; then
  gh release create "$TAG" \
    --title "PR #${PR_NUMBER} Screenshots" \
    --notes "Auto-captured screenshots for PR #${PR_NUMBER}" \
    --draft
fi

# ---------------------------------------------------------------------------
# 6. Build PR comment body
# ---------------------------------------------------------------------------
COMMENT_BODY="<!-- pr-screenshots -->
## Screenshots

Auto-captured for frontend changes on \`${BRANCH}\`.
"

for i in "${!PAGES[@]}"; do
  url="${PAGES[$i]}"
  label="${LABELS[$i]}"
  slug=$(echo "$url" | sed 's|https\?://[^/]*/||;s|/|_|g;s|^$|index|')
  img="$SCREENSHOT_DIR/${slug}.png"

  [[ -f "$img" ]] || continue

  filename=$(basename "$img")
  gh release upload "$TAG" "$img" --clobber 2>/dev/null || continue

  ASSET_URL="https://github.com/${REPO}/releases/download/${TAG}/${filename}"
  COMMENT_BODY+="
### ${label}
![${slug}](${ASSET_URL})
"
done

# ---------------------------------------------------------------------------
# 7. Post or update the PR comment (idempotent via marker)
# ---------------------------------------------------------------------------
MARKER="<!-- pr-screenshots -->"
EXISTING_COMMENT_ID=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
  --jq ".[] | select(.body | contains(\"${MARKER}\")) | .id" 2>/dev/null | head -1 || true)

if [[ -n "$EXISTING_COMMENT_ID" ]]; then
  gh api "repos/${REPO}/issues/comments/${EXISTING_COMMENT_ID}" \
    -X PATCH -f body="$COMMENT_BODY" 2>/dev/null
else
  gh pr comment "$PR_NUMBER" --body "$COMMENT_BODY" 2>/dev/null
fi
