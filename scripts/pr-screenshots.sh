#!/usr/bin/env bash
#
# Captures screenshots of frontend changes and posts them to the PR.
# Designed to run as a Claude Code PostToolUse hook (async).
#
# Prerequisites: agent-browser, gh, jq, curl
# The user's Chrome must be running with --remote-debugging-port=9222
# and the dev server must be running on localhost:3000.
#
# Configuration (env vars):
#   PR_SCREENSHOT_SLUG  - Event slug to capture for /e/ page screenshots.
#                         If unset, queries the dev API for the first available event.
#   PR_SCREENSHOT_WIDTH - Max screenshot width in pixels (default: 1440).
#
set -euo pipefail

MAX_WIDTH="${PR_SCREENSHOT_WIDTH:-1440}"

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

# Fast pre-filter using bash builtins — avoids forking jq on every Bash tool use
case "$HOOK_INPUT" in
  *"commit-push-pr"*|*"git push"*|*"gh pr create"*) ;;
  *) exit 0 ;;
esac

TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null) || true
BASH_CMD=$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || true

if [[ "$TOOL_NAME" == "Skill" ]]; then
  [[ "$SKILL_NAME" == *"commit-push-pr"* ]] || exit 0
elif [[ "$TOOL_NAME" == "Bash" ]]; then
  [[ "$BASH_CMD" == *"git push"* || "$BASH_CMD" == *"gh pr create"* ]] || exit 0
else
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Preflight checks (local-only first, then network)
# ---------------------------------------------------------------------------
command -v agent-browser &>/dev/null || exit 0
command -v gh &>/dev/null            || exit 0
command -v jq &>/dev/null            || exit 0

BRANCH=$(git branch --show-current)

FRONTEND_CHANGES=$(git diff origin/staging --name-only -- 'app/' 'components/' 'emails/' 2>/dev/null || true)
[[ -n "$FRONTEND_CHANGES" ]] || exit 0

PR_NUMBER=$(gh pr view "$BRANCH" --json number -q '.number' 2>/dev/null) || exit 0
[[ -n "$PR_NUMBER" ]] || exit 0

curl -sf -o /dev/null --max-time 3 http://localhost:3000 || exit 0

# ---------------------------------------------------------------------------
# 3. Resolve event slug (env var → dev API → skip)
# ---------------------------------------------------------------------------
EVENT_SLUG="${PR_SCREENSHOT_SLUG:-}"
if [[ -z "$EVENT_SLUG" ]]; then
  EVENT_SLUG=$(curl -sf --max-time 3 http://localhost:3000/api/hackathons 2>/dev/null \
    | jq -r 'if type == "array" then .[0].slug elif .data then .data[0].slug else empty end // empty' 2>/dev/null) || true
fi

# ---------------------------------------------------------------------------
# 4. Determine pages to capture
# ---------------------------------------------------------------------------
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
SCREENSHOT_DIR="/tmp/pr-screenshots-${PR_NUMBER}-$$"
rm -rf "$SCREENSHOT_DIR"
mkdir -p "$SCREENSHOT_DIR"

declare -a PAGES=()
declare -a LABELS=()

PAGES+=("http://localhost:3000")
LABELS+=("Homepage")

if echo "$FRONTEND_CHANGES" | grep -q 'app/(public)/e/' && [[ -n "$EVENT_SLUG" ]]; then
  PAGES+=("http://localhost:3000/e/${EVENT_SLUG}")
  LABELS+=("/e/[slug] (public event)")
fi

if echo "$FRONTEND_CHANGES" | grep -q 'app/(public)/e/\[slug\]/manage' && [[ -n "$EVENT_SLUG" ]]; then
  PAGES+=("http://localhost:3000/e/${EVENT_SLUG}/manage")
  LABELS+=("/e/[slug]/manage (organizer)")
fi

if echo "$FRONTEND_CHANGES" | grep -q 'app/(dashboard)/'; then
  PAGES+=("http://localhost:3000/hackathons")
  LABELS+=("/hackathons (dashboard)")
fi

# ---------------------------------------------------------------------------
# 5. Capture screenshots via agent-browser
# ---------------------------------------------------------------------------
for i in "${!PAGES[@]}"; do
  url="${PAGES[$i]}"
  slug=$(echo "$url" | sed 's|https\?://[^/]*/||;s|/|_|g;s|^$|index|')

  agent-browser --auto-connect --session "$SESSION" open "$url" 2>/dev/null || continue
  agent-browser --session "$SESSION" wait --load networkidle 2>/dev/null || true
  agent-browser --session "$SESSION" wait 2000 2>/dev/null || true
  agent-browser --session "$SESSION" screenshot --full "$SCREENSHOT_DIR/${slug}.png" 2>/dev/null || continue
done

agent-browser --session "$SESSION" close 2>/dev/null || true

# ---------------------------------------------------------------------------
# 6. Compress screenshots (resize + convert to JPEG)
# ---------------------------------------------------------------------------
shopt -s nullglob
PNGS=("$SCREENSHOT_DIR"/*.png)
shopt -u nullglob
[[ ${#PNGS[@]} -gt 0 ]] || exit 0

for img in "${PNGS[@]}"; do
  jpg="${img%.png}.jpg"
  if command -v sips &>/dev/null; then
    sips --resampleWidth "$MAX_WIDTH" "$img" --out "$img" &>/dev/null || true
    sips -s format jpeg -s formatOptions 80 "$img" --out "$jpg" &>/dev/null || true
  elif command -v convert &>/dev/null; then
    convert "$img" -resize "${MAX_WIDTH}>" -quality 80 "$jpg" 2>/dev/null || true
  fi
  if [[ -f "$jpg" ]]; then
    rm -f "$img"
  fi
done

shopt -s nullglob
SCREENSHOTS=("$SCREENSHOT_DIR"/*.jpg "$SCREENSHOT_DIR"/*.png)
shopt -u nullglob
[[ ${#SCREENSHOTS[@]} -gt 0 ]] || exit 0

# ---------------------------------------------------------------------------
# 7. Upload to a draft GitHub release (replace all previous assets)
# ---------------------------------------------------------------------------
TAG="pr-${PR_NUMBER}-screenshots"

if ! gh release view "$TAG" &>/dev/null; then
  gh release create "$TAG" \
    --title "PR #${PR_NUMBER} Screenshots" \
    --notes "Auto-captured screenshots for PR #${PR_NUMBER}" \
    --draft
else
  gh release view "$TAG" --json assets --jq '.assets[].name' 2>/dev/null | while read -r old_asset; do
    ASSET_ID=$(gh api "repos/${REPO}/releases" --jq ".[] | select(.tag_name == \"${TAG}\") | .assets[] | select(.name == \"${old_asset}\") | .id" 2>/dev/null) || true
    [[ -n "$ASSET_ID" ]] && gh api "repos/${REPO}/releases/assets/${ASSET_ID}" -X DELETE 2>/dev/null || true
  done
fi

# ---------------------------------------------------------------------------
# 8. Build PR comment body
# ---------------------------------------------------------------------------
COMMENT_BODY="<!-- pr-screenshots -->
## Screenshots

Auto-captured for frontend changes on \`${BRANCH}\`.
"

for i in "${!PAGES[@]}"; do
  url="${PAGES[$i]}"
  label="${LABELS[$i]}"
  slug=$(echo "$url" | sed 's|https\?://[^/]*/||;s|/|_|g;s|^$|index|')

  shopt -s nullglob
  matches=("$SCREENSHOT_DIR/${slug}".*)
  shopt -u nullglob
  [[ ${#matches[@]} -gt 0 ]] || continue
  img="${matches[0]}"

  filename=$(basename "$img")
  gh release upload "$TAG" "$img" --clobber 2>/dev/null || continue

  ASSET_URL="https://github.com/${REPO}/releases/download/${TAG}/${filename}"
  COMMENT_BODY+="
### ${label}
![${slug}](${ASSET_URL})
"
done

# ---------------------------------------------------------------------------
# 9. Post or update the PR comment (idempotent via marker)
# ---------------------------------------------------------------------------
MARKER="<!-- pr-screenshots -->"
EXISTING_COMMENT_ID=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
  --jq ".[] | select(.body | contains(\"${MARKER}\")) | .id" 2>/dev/null | head -1 || true)

BODY_JSON="$SCREENSHOT_DIR/comment.json"
jq -n --arg body "$COMMENT_BODY" '{"body": $body}' > "$BODY_JSON"

if [[ -n "$EXISTING_COMMENT_ID" ]]; then
  gh api "repos/${REPO}/issues/comments/${EXISTING_COMMENT_ID}" \
    -X PATCH --input "$BODY_JSON" 2>/dev/null
else
  gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
    -X POST --input "$BODY_JSON" 2>/dev/null
fi
