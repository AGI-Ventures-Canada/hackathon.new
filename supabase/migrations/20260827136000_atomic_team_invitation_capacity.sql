create or replace function public.enforce_team_invitation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_members integer;
  v_pending integer;
begin
  if new.status <> 'pending' then return new; end if;
  select max_team_size into v_max from public.hackathons where id = new.hackathon_id;
  if v_max is null then return new; end if;
  perform 1 from public.teams where id = new.team_id for update;
  select count(*) into v_members from public.hackathon_participants where team_id = new.team_id;
  select count(*) into v_pending from public.team_invitations where team_id = new.team_id and status = 'pending' and expires_at > now();
  if v_members + v_pending + 1 > v_max then
    raise exception using errcode = 'check_violation', message = 'Team would exceed maximum size';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_team_invitation_capacity_on_insert on public.team_invitations;
create trigger enforce_team_invitation_capacity_on_insert
before insert on public.team_invitations
for each row execute function public.enforce_team_invitation_capacity();

revoke all on function public.enforce_team_invitation_capacity() from public, anon, authenticated;
grant execute on function public.enforce_team_invitation_capacity() to service_role;
