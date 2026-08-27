with ranked_assignments as (
  select
    id,
    row_number() over (partition by team_id order by id desc) as position
  from public.room_teams
)
delete from public.room_teams
where id in (
  select id
  from ranked_assignments
  where position > 1
);

create unique index if not exists room_teams_one_room_per_team_idx
  on public.room_teams (team_id);

create or replace function public.bulk_assign_teams(p_hackathon_id uuid, p_assignments jsonb)
returns table(success boolean, error_code text, error_message text, assigned_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_count integer := 0;
  v_rows integer;
begin
  if not exists (select 1 from public.hackathons where id = p_hackathon_id) then
    return query select false, 'hackathon_not_found', 'Hackathon not found', 0;
    return;
  end if;
  for v_entry in select value from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    insert into public.room_teams (room_id, team_id)
    values ((v_entry->>'roomId')::uuid, (v_entry->>'teamId')::uuid)
    on conflict (team_id) do update set room_id = excluded.room_id;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return query select true, null::text, null::text, v_count;
end;
$$;

revoke all on function public.bulk_assign_teams(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bulk_assign_teams(uuid, jsonb) to service_role;
