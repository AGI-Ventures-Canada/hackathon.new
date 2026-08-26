#!/bin/bash

ENV_FILE=".env.local"
PROD_BACKUP=".env.local.production"
TYPES_FILE="lib/db/types.ts"

if ! docker info &>/dev/null 2>&1; then
  echo "Docker is not running. Please start Docker Desktop first."
  exit 1
fi

sync_env_from_main_worktree() {
  local git_common_dir
  git_common_dir=$(git rev-parse --git-common-dir 2>/dev/null) || return 0
  local main_worktree
  main_worktree=$(cd "$git_common_dir/.." 2>/dev/null && pwd) || return 0
  local current_worktree
  current_worktree=$(pwd)
  if [ "$main_worktree" = "$current_worktree" ]; then
    return 0
  fi
  local main_env="$main_worktree/$ENV_FILE"
  if [ ! -f "$main_env" ]; then
    return 0
  fi
  touch "$ENV_FILE"
  local copied=0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    local key="${line%%=*}"
    case "$key" in
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|CLERK_SECRET_KEY|ENCRYPTION_KEY|SCENARIO_ORG_ID|SCENARIO_DEV_USER_ID) ;;
      *) continue ;;
    esac
    if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      continue
    fi
    echo "$line" >> "$ENV_FILE"
    copied=$((copied + 1))
  done < "$main_env"
  if [ $copied -gt 0 ]; then
    echo "Copied $copied key(s) from main worktree's .env.local (Clerk, encryption, scenarios)"
  fi
}

sync_env_from_main_worktree

stop_other_projects() {
  local other_containers=$(docker ps --filter "name=supabase_" --format "{{.Names}}" | grep -v "oatmeal" || true)
  if [ -n "$other_containers" ]; then
    echo "Stopping other Supabase projects to free resources..."
    docker ps --filter "name=supabase_" --format "{{.ID}} {{.Names}}" | grep -v "oatmeal" | while read id name; do
      echo "  Stopping $name"
    done
    docker stop $(docker ps --filter "name=supabase_" --format "{{.ID}} {{.Names}}" | grep -v "oatmeal" | awk '{print $1}') 2>/dev/null || true
    echo "Other projects stopped"
  fi
}

stop_other_projects

cleanup_corrupted_state() {
  echo "Cleaning up corrupted Docker state..."
  supabase stop --no-backup 2>/dev/null || true
  docker ps -a --filter "name=supabase_.*_oatmeal" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
  docker network ls --filter "name=supabase_network_oatmeal" --format "{{.ID}}" | xargs -r docker network rm 2>/dev/null || true
  sleep 2
}

verify_containers_healthy() {
  local db_container="supabase_db_oatmeal"
  if ! docker ps --format "{{.Names}}" | grep -q "^${db_container}$"; then
    return 1
  fi
  if ! docker exec "$db_container" pg_isready -U postgres &>/dev/null; then
    return 1
  fi
  return 0
}

check_for_stopped_services() {
  # Check if supabase status shows any stopped services
  local status_output=$(supabase status 2>&1)
  if echo "$status_output" | grep -q "Stopped services:"; then
    return 0  # Has stopped services
  fi
  return 1  # No stopped services
}

wait_for_storage() {
  local storage_url="http://127.0.0.1:54321/storage/v1/bucket"
  local max_attempts=12
  local attempt=1
  local wait_seconds=5

  echo "Waiting for storage service to be ready..."
  while [ $attempt -le $max_attempts ]; do
    if curl -s --connect-timeout 3 --max-time 5 -o /dev/null -w "%{http_code}" "$storage_url" 2>/dev/null | grep -qE "^[2-4]"; then
      echo "Storage service is ready"
      return 0
    fi
    echo "  Storage not ready yet (attempt $attempt/$max_attempts)..."
    sleep $wait_seconds
    attempt=$((attempt + 1))
  done

  echo "Warning: Storage service did not become ready within $((max_attempts * wait_seconds))s"
  return 1
}

start_supabase_with_recovery() {
  local max_attempts=2
  local attempt=1
  local timeout_seconds=120

  while [ $attempt -le $max_attempts ]; do
    echo "Starting local Supabase (attempt $attempt/$max_attempts)..."

    # Run supabase start in background with timeout
    supabase start --ignore-health-check 2>&1 &
    local pid=$!

    # Wait for completion or timeout
    local elapsed=0
    while kill -0 $pid 2>/dev/null && [ $elapsed -lt $timeout_seconds ]; do
      sleep 5
      elapsed=$((elapsed + 5))
    done

    # Check if process completed
    if ! kill -0 $pid 2>/dev/null; then
      wait $pid
      local exit_code=$?
      if [ $exit_code -eq 0 ]; then
        sleep 3
        if verify_containers_healthy; then
          echo "Supabase started successfully"
          return 0
        fi
      fi
    else
      # Process still running after timeout
      echo "Supabase start timed out after ${timeout_seconds}s"
      kill $pid 2>/dev/null || true
      wait $pid 2>/dev/null || true
      # Check if DB is actually running despite timeout
      if verify_containers_healthy; then
        echo "DB container is healthy despite timeout - proceeding"
        return 0
      fi
    fi

    if [ $attempt -lt $max_attempts ]; then
      cleanup_corrupted_state
    fi
    attempt=$((attempt + 1))
  done

  echo "Failed to start Supabase after $max_attempts attempts"
  return 1
}

# Check if this project's Supabase is already running and healthy
if supabase status &>/dev/null && verify_containers_healthy; then
  # Also check for stopped services that can cause 502 errors during db reset
  if check_for_stopped_services; then
    echo "Supabase has stopped services, doing clean restart..."
    cleanup_corrupted_state
    start_supabase_with_recovery
  else
    echo "Supabase already running for this project, skipping startup..."
  fi
else
  if supabase status &>/dev/null; then
    echo "Supabase state exists but containers are unhealthy"
    cleanup_corrupted_state
  fi
  start_supabase_with_recovery
fi

wait_for_storage

echo "Getting Supabase credentials..."
STATUS_JSON=$(supabase status --output json 2>/dev/null)
API_URL=$(echo "$STATUS_JSON" | grep '"API_URL"' | cut -d'"' -f4)
ANON_KEY=$(echo "$STATUS_JSON" | grep '"ANON_KEY"' | cut -d'"' -f4)
SERVICE_KEY=$(echo "$STATUS_JSON" | grep '"SERVICE_ROLE_KEY"' | cut -d'"' -f4)

if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ] || [ -z "$SERVICE_KEY" ]; then
  echo "Failed to get local Supabase credentials"
  exit 1
fi

if [ -f "$ENV_FILE" ] && [ ! -f "$PROD_BACKUP" ]; then
  if grep -q "supabase.co" "$ENV_FILE"; then
    echo "Backing up production credentials to $PROD_BACKUP"
    cp "$ENV_FILE" "$PROD_BACKUP"
  fi
fi

set_env_var() {
  local key="$1"
  local value="$2"

  if [ -f "$ENV_FILE" ]; then
    grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  fi

  echo "${key}=\"${value}\"" >> "$ENV_FILE"
}

has_hex_secret() {
  local key="$1"
  grep -Eq "^${key}=\"?[[:xdigit:]]{64}\"?$" "$ENV_FILE" 2>/dev/null
}

touch "$ENV_FILE"

echo "Updating .env.local with local Supabase credentials..."
set_env_var "NEXT_PUBLIC_SUPABASE_URL" "$API_URL"
set_env_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$ANON_KEY"
set_env_var "SUPABASE_SERVICE_ROLE_KEY" "$SERVICE_KEY"

if ! has_hex_secret "API_KEY_SECRET"; then
  echo "Generating API_KEY_SECRET..."
  set_env_var "API_KEY_SECRET" "$(openssl rand -hex 32)"
fi

if ! has_hex_secret "ENCRYPTION_KEY"; then
  echo "Generating ENCRYPTION_KEY..."
  set_env_var "ENCRYPTION_KEY" "$(openssl rand -hex 32)"
fi

echo "Using local Supabase ($API_URL)"
echo "   Studio: http://127.0.0.1:54423"

echo "Generating Supabase TypeScript types..."
if supabase gen types typescript --local > "$TYPES_FILE" 2>/dev/null; then
  echo "Types generated at $TYPES_FILE"
else
  echo "Type generation skipped (run 'bun run update-types' manually if needed)"
fi
