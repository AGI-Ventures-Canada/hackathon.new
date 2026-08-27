create or replace function public.enforce_team_review_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'pending_approval' and exists (
    select 1
    from public.hackathons
    where id = new.hackathon_id
      and require_team_approval = false
  ) then
    new.status := 'forming';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_team_review_status_on_team on public.teams;
create trigger enforce_team_review_status_on_team
before insert or update of status, hackathon_id on public.teams
for each row execute function public.enforce_team_review_status();

create or replace function public.promote_teams_when_review_is_disabled()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.require_team_approval = true and new.require_team_approval = false then
    update public.teams
    set status = 'forming',
        updated_at = now()
    where hackathon_id = new.id
      and status = 'pending_approval';
  end if;
  return new;
end;
$$;

drop trigger if exists promote_teams_when_review_is_disabled_on_hackathon on public.hackathons;
create trigger promote_teams_when_review_is_disabled_on_hackathon
after update of require_team_approval on public.hackathons
for each row execute function public.promote_teams_when_review_is_disabled();

revoke all on function public.enforce_team_review_status() from public, anon, authenticated;
revoke all on function public.promote_teams_when_review_is_disabled() from public, anon, authenticated;
