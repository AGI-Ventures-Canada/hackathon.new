alter table public.cli_auth_sessions
  add column if not exists user_code text;

create unique index if not exists cli_auth_sessions_user_code_idx
  on public.cli_auth_sessions (user_code)
  where user_code is not null;
