#!/usr/bin/env bash
# Launch agent-browser against local dev with your real Chrome auth state.
#
# Usage:
#   ./scripts/browser.sh [path]         # e.g. ./scripts/browser.sh /home
#   ./scripts/browser.sh --refresh-auth # re-save auth from side Chrome
#   ./scripts/browser.sh --close        # close the oatmeal session
#   ./scripts/browser.sh --quit-chrome  # also quit the side Chrome instance
#
# How it works:
#   Launches a second Chrome instance with a dedicated profile at
#   .auth/chrome-profile/ and --remote-debugging-port=9222, leaving your
#   main Chrome window untouched. First run: sign in once in the side
#   window. Auth persists in that profile for every future run.
#
# Prereq: dev server running (bun dev).

set -euo pipefail

SESSION="oatmeal"
BASE_URL="${OATMEAL_BASE_URL:-http://localhost:3000}"
CHROME_DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"
CHROME_APP="${CHROME_APP:-/Applications/Google Chrome.app}"
CHROME_PROFILE_DIR="${CHROME_PROFILE_DIR:-$PWD/.auth/chrome-profile}"
AUTH_FILE=".auth/auth.json"
TARGET_PATH="/home"
REFRESH_AUTH=false
QUIT_CHROME=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --close)
      agent-browser --session "$SESSION" close --all || true
      exit 0
      ;;
    --quit-chrome)
      QUIT_CHROME=true
      shift
      ;;
    --refresh-auth)
      REFRESH_AUTH=true
      shift
      ;;
    -h|--help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      TARGET_PATH="$1"
      shift
      ;;
  esac
done

URL="${BASE_URL}${TARGET_PATH}"

command -v agent-browser >/dev/null 2>&1 || {
  echo "✗ agent-browser not installed. Install: npm i -g agent-browser" >&2
  exit 1
}

debug_port_open() {
  curl -s --max-time 1 -o /dev/null "http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version"
}

wait_for_debug_port() {
  local attempts=0
  while (( attempts < 30 )); do
    if debug_port_open; then return 0; fi
    sleep 0.5
    ((attempts++))
  done
  return 1
}

quit_side_chrome() {
  if [[ ! -d "$CHROME_PROFILE_DIR" ]]; then return 0; fi
  local pid
  pid=$(pgrep -f -- "--user-data-dir=${CHROME_PROFILE_DIR}" | head -n1 || true)
  if [[ -n "$pid" ]]; then
    echo "→ Quitting side Chrome (pid $pid)..."
    kill "$pid" 2>/dev/null || true
  fi
}

if [[ "$QUIT_CHROME" == "true" ]]; then
  agent-browser --session "$SESSION" close --all >/dev/null 2>&1 || true
  quit_side_chrome
  exit 0
fi

if ! curl -s --max-time 2 -o /dev/null "$BASE_URL"; then
  echo "✗ Dev server not reachable at $BASE_URL" >&2
  echo "  Start it in another terminal: bun dev" >&2
  exit 1
fi

ensure_side_chrome() {
  if debug_port_open; then return 0; fi

  if [[ ! -d "$CHROME_APP" ]]; then
    echo "✗ Google Chrome not found at $CHROME_APP" >&2
    echo "  Set CHROME_APP=/path/to/Google\\ Chrome.app or install Chrome." >&2
    return 1
  fi

  mkdir -p "$CHROME_PROFILE_DIR"
  local first_run=false
  if [[ -z "$(ls -A "$CHROME_PROFILE_DIR" 2>/dev/null)" ]]; then
    first_run=true
  fi

  echo "→ Launching side Chrome (profile: $CHROME_PROFILE_DIR)..."
  open -na "$CHROME_APP" --args \
    --user-data-dir="$CHROME_PROFILE_DIR" \
    --remote-debugging-port="$CHROME_DEBUG_PORT" \
    --no-first-run \
    --no-default-browser-check \
    --disable-features=ChromeWhatsNewUI \
    "${BASE_URL}/home"

  if ! wait_for_debug_port; then
    echo "✗ Side Chrome launched but debug port didn't open within 15s." >&2
    return 1
  fi
  echo "✓ Side Chrome ready on port ${CHROME_DEBUG_PORT}."

  if [[ "$first_run" == "true" ]] && [[ ! -f "$AUTH_FILE" ]]; then
    cat >&2 <<EOF

ℹ First run: sign in at ${BASE_URL}/home in the side Chrome window that just opened.
  Auth will persist in ${CHROME_PROFILE_DIR} for every future run.
  Press Enter when you're signed in (or Ctrl+C to abort)...
EOF
    if [[ -t 0 ]]; then read -r _; fi
  elif [[ "$first_run" == "true" ]]; then
    echo "→ Using saved auth from $AUTH_FILE (skipping sign-in prompt)."
  fi
}

ensure_side_chrome || exit 1

if [[ ! -f "$AUTH_FILE" ]] || [[ "$REFRESH_AUTH" == "true" ]]; then
  mkdir -p "$(dirname "$AUTH_FILE")"
  echo "→ Saving auth state from Chrome → $AUTH_FILE"
  agent-browser --auto-connect state save "$AUTH_FILE"
fi

agent-browser --session "$SESSION" close --all >/dev/null 2>&1 || true

echo "→ Opening $URL"
agent-browser --session "$SESSION" --state "$AUTH_FILE" open "$URL"
agent-browser --session "$SESSION" wait --load networkidle

echo ""
echo "→ Snapshot:"
agent-browser --session "$SESSION" snapshot -i

cat <<EOF

✓ Session '$SESSION' ready at $URL

Follow-up commands:
  agent-browser --session $SESSION snapshot -i
  agent-browser --session $SESSION screenshot /tmp/shot.png
  agent-browser --session $SESSION console
  agent-browser --session $SESSION eval '<js>'
  ./scripts/browser.sh --close
EOF
