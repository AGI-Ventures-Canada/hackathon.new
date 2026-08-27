with ranked_active_rounds as (
  select
    id,
    row_number() over (partition by hackathon_id order by updated_at desc, created_at desc, id desc) as position
  from public.judging_rounds
  where is_active = true
)
update public.judging_rounds
set is_active = false,
    status = case when status = 'active' then 'planned' else status end,
    updated_at = now()
where id in (
  select id
  from ranked_active_rounds
  where position > 1
);

create unique index if not exists judging_rounds_one_active_per_hackathon_idx
  on public.judging_rounds (hackathon_id)
  where is_active = true;

create or replace function public.activate_judging_round(
  p_hackathon_id uuid,
  p_round_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.judging_rounds
    where id = p_round_id
      and hackathon_id = p_hackathon_id
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_hackathon_id::text, 0));

  update public.judging_rounds
  set status = 'planned',
      is_active = false,
      updated_at = now()
  where hackathon_id = p_hackathon_id
    and id <> p_round_id
    and is_active = true;

  update public.judging_rounds
  set status = 'active',
      is_active = true,
      updated_at = now()
  where id = p_round_id
    and hackathon_id = p_hackathon_id;

  return found;
end;
$$;

revoke all on function public.activate_judging_round(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_judging_round(uuid, uuid) to service_role;
