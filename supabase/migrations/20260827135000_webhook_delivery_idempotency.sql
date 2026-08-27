alter table public.webhook_deliveries
  add column if not exists idempotency_key text;

create unique index if not exists webhook_deliveries_idempotency_idx
  on public.webhook_deliveries (webhook_id, event, idempotency_key)
  where idempotency_key is not null;

create or replace function public.increment_webhook_failure(p_webhook_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.webhooks
  set failure_count = coalesce(failure_count, 0) + 1,
      last_failure_at = now(),
      updated_at = now()
  where id = p_webhook_id;
  return found;
end;
$$;

revoke all on function public.increment_webhook_failure(uuid) from public, anon, authenticated;
grant execute on function public.increment_webhook_failure(uuid) to service_role;
