contains_remote_supabase_credentials() {
  local env_file="$1"
  [ -f "$env_file" ] || return 1

  # A hosted URL is unambiguously remote. If credentials exist without a
  # local URL, fail closed because we cannot prove they are safe to replace.
  if grep -Eq '^(NEXT_PUBLIC_)?SUPABASE_URL=.*\.supabase\.co' "$env_file"; then
    return 0
  fi
  if grep -Eq '^(NEXT_PUBLIC_)?SUPABASE_URL=' "$env_file"; then
    return 1
  fi
  grep -Eq '^(NEXT_PUBLIC_)?SUPABASE_(ANON_KEY|SERVICE_ROLE_KEY)=.+|^SUPABASE_ACCESS_TOKEN=.+' "$env_file"
}
