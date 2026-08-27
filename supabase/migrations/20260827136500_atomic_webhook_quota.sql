create or replace function public.enforce_webhook_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform 1 from public.tenants where id = new.tenant_id for update;
  select count(*) into v_count from public.webhooks where tenant_id = new.tenant_id;
  if v_count >= 20 then
    raise exception using errcode = 'check_violation', message = 'Webhook limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_webhook_quota_on_insert on public.webhooks;
create trigger enforce_webhook_quota_on_insert
before insert on public.webhooks
for each row execute function public.enforce_webhook_quota();

revoke all on function public.enforce_webhook_quota() from public, anon, authenticated;
grant execute on function public.enforce_webhook_quota() to service_role;
