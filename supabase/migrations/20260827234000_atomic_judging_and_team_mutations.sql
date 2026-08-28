drop trigger if exists prevent_late_team_creation on public.teams;
drop function if exists public.prevent_late_team_creation();

create or replace function public.save_prize_configuration_atomic(
  p_hackathon_id uuid,
  p_prize_id uuid,
  p_prize_updates jsonb default '{}'::jsonb,
  p_criteria jsonb default null,
  p_buckets jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize public.prizes%rowtype;
  v_hackathon public.hackathons%rowtype;
  v_criterion jsonb;
  v_bucket jsonb;
  v_order integer;
begin
  select * into v_hackathon
  from public.hackathons
  where id = p_hackathon_id
  for update;
  if not found then raise exception 'Hackathon not found'; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;

  select * into v_prize
  from public.prizes
  where id = p_prize_id and hackathon_id = p_hackathon_id
  for update;

  if not found then
    return null;
  end if;

  if p_prize_updates ? 'round_id'
    and p_prize_updates->>'round_id' is not null
    and not exists (
      select 1 from public.judging_rounds
      where id = (p_prize_updates->>'round_id')::uuid
        and hackathon_id = p_hackathon_id
    ) then
    raise exception 'Round does not belong to this hackathon';
  end if;

  if p_prize_updates ? 'criteria_id'
    and p_prize_updates->>'criteria_id' is not null
    and not exists (
      select 1 from public.judging_criteria
      where id = (p_prize_updates->>'criteria_id')::uuid
        and hackathon_id = p_hackathon_id
    ) then
    raise exception 'Criterion does not belong to this hackathon';
  end if;

  if p_criteria is not null then
    if jsonb_typeof(p_criteria) <> 'array' then
      raise exception 'Criteria must be an array';
    end if;
    for v_criterion in select value from jsonb_array_elements(p_criteria) loop
      if btrim(coalesce(v_criterion->>'name', '')) = '' then
        raise exception 'Criterion name is required';
      end if;
      if (v_criterion->>'min_score')::numeric >= (v_criterion->>'max_score')::numeric then
        raise exception 'Minimum score must be less than maximum score';
      end if;
      if (v_criterion->>'weight')::numeric < 0 then
        raise exception 'Criterion weight cannot be negative';
      end if;
    end loop;
  end if;

  if p_buckets is not null then
    if jsonb_typeof(p_buckets) <> 'array' then
      raise exception 'Buckets must be an array';
    end if;
    for v_bucket in select value from jsonb_array_elements(p_buckets) loop
      if btrim(coalesce(v_bucket->>'label', '')) = '' then
        raise exception 'Bucket label is required';
      end if;
    end loop;
  end if;

  update public.prizes
  set
    name = case when p_prize_updates ? 'name' then p_prize_updates->>'name' else name end,
    description = case when p_prize_updates ? 'description' then p_prize_updates->>'description' else description end,
    value = case when p_prize_updates ? 'value' then p_prize_updates->>'value' else value end,
    judging_style = case when p_prize_updates ? 'judging_style' then p_prize_updates->>'judging_style' else judging_style end,
    round_id = case when p_prize_updates ? 'round_id' then (p_prize_updates->>'round_id')::uuid else round_id end,
    assignment_mode = case when p_prize_updates ? 'assignment_mode' then p_prize_updates->>'assignment_mode' else assignment_mode end,
    max_picks = case when p_prize_updates ? 'max_picks' then (p_prize_updates->>'max_picks')::integer else max_picks end,
    display_order = case when p_prize_updates ? 'display_order' then (p_prize_updates->>'display_order')::integer else display_order end,
    allowed_team_modes = case
      when not (p_prize_updates ? 'allowed_team_modes') then allowed_team_modes
      when p_prize_updates->'allowed_team_modes' = 'null'::jsonb then null
      else array(select jsonb_array_elements_text(p_prize_updates->'allowed_team_modes'))::public.team_mode[]
    end,
    type = case when p_prize_updates ? 'type' then (p_prize_updates->>'type')::public.prize_type else type end,
    rank = case when p_prize_updates ? 'rank' then (p_prize_updates->>'rank')::integer else rank end,
    kind = case when p_prize_updates ? 'kind' then p_prize_updates->>'kind' else kind end,
    monetary_value = case when p_prize_updates ? 'monetary_value' then (p_prize_updates->>'monetary_value')::numeric else monetary_value end,
    currency = case when p_prize_updates ? 'currency' then p_prize_updates->>'currency' else currency end,
    criteria_id = case when p_prize_updates ? 'criteria_id' then (p_prize_updates->>'criteria_id')::uuid else criteria_id end,
    distribution_method = case when p_prize_updates ? 'distribution_method' then p_prize_updates->>'distribution_method' else distribution_method end,
    display_value = case when p_prize_updates ? 'display_value' then p_prize_updates->>'display_value' else display_value end,
    is_screening = case when p_prize_updates ? 'is_screening' then (p_prize_updates->>'is_screening')::boolean else is_screening end,
    updated_at = now()
  where id = p_prize_id and hackathon_id = p_hackathon_id
  returning * into v_prize;

  if p_criteria is not null then
    delete from public.judging_criteria where prize_id = p_prize_id;
    v_order := 0;
    for v_criterion in select value from jsonb_array_elements(p_criteria) loop
      insert into public.judging_criteria (
        hackathon_id, prize_id, name, description, min_score, max_score, weight, display_order
      ) values (
        p_hackathon_id,
        p_prize_id,
        btrim(v_criterion->>'name'),
        nullif(btrim(coalesce(v_criterion->>'description', '')), ''),
        (v_criterion->>'min_score')::integer,
        (v_criterion->>'max_score')::integer,
        (v_criterion->>'weight')::numeric,
        v_order
      );
      v_order := v_order + 1;
    end loop;
  end if;

  if p_buckets is not null then
    delete from public.bucket_definitions where prize_id = p_prize_id;
    v_order := 0;
    for v_bucket in select value from jsonb_array_elements(p_buckets) loop
      insert into public.bucket_definitions (
        prize_id, level, label, description, display_order
      ) values (
        p_prize_id,
        (v_bucket->>'level')::integer,
        btrim(v_bucket->>'label'),
        nullif(btrim(coalesce(v_bucket->>'description', '')), ''),
        v_order
      );
      v_order := v_order + 1;
    end loop;
  end if;

  return to_jsonb(v_prize);
end;
$$;

create or replace function public.create_prize_configuration_atomic(
  p_hackathon_id uuid,
  p_prize_values jsonb,
  p_criteria jsonb default null,
  p_buckets jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize_id uuid;
begin
  if btrim(coalesce(p_prize_values->>'name', '')) = '' then
    raise exception 'Prize name is required';
  end if;

  insert into public.prizes (id, hackathon_id, name)
  values (
    coalesce((p_prize_values->>'id')::uuid, gen_random_uuid()),
    p_hackathon_id,
    btrim(p_prize_values->>'name')
  )
  returning id into v_prize_id;

  return public.save_prize_configuration_atomic(
    p_hackathon_id,
    v_prize_id,
    p_prize_values,
    p_criteria,
    p_buckets
  );
end;
$$;

create or replace function public.replace_core_results_atomic(
  p_hackathon_id uuid,
  p_results jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_count integer := 0;
  v_results_published_at timestamptz;
begin
  select results_published_at into v_results_published_at
  from public.hackathons where id = p_hackathon_id for update;
  if not found then raise exception 'Hackathon not found'; end if;
  if v_results_published_at is not null then raise exception 'Results are published'; end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'Results must be an array';
  end if;

  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    if not exists (
      select 1 from public.submissions
      where id = (v_result->>'submission_id')::uuid
        and hackathon_id = p_hackathon_id
    ) then
      raise exception 'Submission does not belong to this hackathon';
    end if;
  end loop;

  delete from public.hackathon_results
  where hackathon_id = p_hackathon_id and result_kind = 'core_only';

  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    insert into public.hackathon_results (
      hackathon_id, submission_id, rank, total_score, weighted_score,
      judge_count, prize_id, result_kind
    ) values (
      p_hackathon_id,
      (v_result->>'submission_id')::uuid,
      (v_result->>'rank')::integer,
      (v_result->>'total_score')::numeric,
      (v_result->>'weighted_score')::numeric,
      (v_result->>'judge_count')::integer,
      null,
      'core_only'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.clear_judge_assignments_atomic(p_hackathon_id uuid)
returns table(removed_count integer, results_stale boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer;
  v_hackathon public.hackathons%rowtype;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then raise exception 'Hackathon not found'; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;

  delete from public.judge_picks where hackathon_id = p_hackathon_id;
  delete from public.judge_assignments where hackathon_id = p_hackathon_id;
  get diagnostics v_removed = row_count;

  delete from public.judge_prize_assignments where hackathon_id = p_hackathon_id;

  return query select
    v_removed,
    exists(select 1 from public.hackathon_results where hackathon_id = p_hackathon_id);
end;
$$;

create or replace function public.modify_team_member_atomic(
  p_hackathon_id uuid,
  p_team_id uuid,
  p_clerk_user_id text,
  p_action text
)
returns table(success boolean, error_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_max_team_size integer;
  v_participant_id uuid;
  v_current_team_id uuid;
  v_member_count integer;
begin
  select h.status::text, h.max_team_size
  into v_status, v_max_team_size
  from public.teams t
  join public.hackathons h on h.id = t.hackathon_id
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
  for update of t;

  if not found then
    return query select false, 'team_not_found'::text;
    return;
  end if;

  if v_status in ('judging', 'completed', 'archived') then
    return query select false, 'event_locked'::text;
    return;
  end if;

  select id, team_id into v_participant_id, v_current_team_id
  from public.hackathon_participants
  where hackathon_id = p_hackathon_id
    and clerk_user_id = p_clerk_user_id
    and role = 'participant'
  for update;

  if not found then
    return query select false, 'participant_not_found'::text;
    return;
  end if;

  if p_action = 'remove' then
    if v_current_team_id is distinct from p_team_id then
      return query select false, 'not_on_team'::text;
      return;
    end if;
    update public.hackathon_participants set team_id = null where id = v_participant_id;
  elsif p_action = 'add' then
    if v_current_team_id = p_team_id then
      return query select true, null::text;
      return;
    end if;
    select count(*) into v_member_count
    from public.hackathon_participants
    where hackathon_id = p_hackathon_id and team_id = p_team_id;
    if v_max_team_size is not null and v_member_count >= v_max_team_size then
      return query select false, 'team_full'::text;
      return;
    end if;
    update public.hackathon_participants set team_id = p_team_id where id = v_participant_id;
  else
    return query select false, 'invalid_action'::text;
    return;
  end if;

  return query select true, null::text;
end;
$$;

create or replace function public.prevent_team_delete_with_projects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.submissions where team_id = old.id) then
    raise exception using errcode = '23503', message = 'Team has projects';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_team_delete_with_projects on public.teams;
create trigger prevent_team_delete_with_projects
before delete on public.teams
for each row execute function public.prevent_team_delete_with_projects();

create or replace function public.delete_team_atomic(p_hackathon_id uuid, p_team_id uuid)
returns table(success boolean, error_code text, members_unassigned integer, invites_cancelled integer, rooms_cleared integer, invitation_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_members integer;
  v_rooms integer;
  v_invitation_ids uuid[];
begin
  select h.status::text into v_status
  from public.teams t
  join public.hackathons h on h.id = t.hackathon_id
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
  for update of t;
  if not found then
    return query select false, 'not_found'::text, 0, 0, 0, array[]::uuid[];
    return;
  end if;
  if v_status in ('judging', 'completed', 'archived') then
    return query select false, 'status_locked'::text, 0, 0, 0, array[]::uuid[];
    return;
  end if;
  if exists (select 1 from public.submissions where team_id = p_team_id) then
    return query select false, 'submission_exists'::text, 0, 0, 0, array[]::uuid[];
    return;
  end if;

  select count(*) into v_members from public.hackathon_participants
  where hackathon_id = p_hackathon_id and team_id = p_team_id;
  select count(*) into v_rooms from public.room_teams where team_id = p_team_id;

  with cancelled as (
    update public.team_invitations
    set status = 'cancelled', updated_at = now()
    where team_id = p_team_id and status = 'pending'
    returning id
  ) select coalesce(array_agg(id), array[]::uuid[]) into v_invitation_ids from cancelled;

  delete from public.teams where id = p_team_id and hackathon_id = p_hackathon_id;
  return query select true, null::text, v_members, cardinality(v_invitation_ids), v_rooms, v_invitation_ids;
end;
$$;

create or replace function public.replace_captain_invitation_atomic(
  p_hackathon_id uuid,
  p_team_id uuid,
  p_email text,
  p_token text,
  p_invited_by text,
  p_expires_at timestamptz
)
returns table(invitation_id uuid, cancelled_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled uuid[];
  v_invitation_id uuid;
  v_status text;
begin
  select h.status::text into v_status
  from public.teams t
  join public.hackathons h on h.id = t.hackathon_id
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
    and t.captain_clerk_user_id is null
  for update of t, h;
  if not found then raise exception 'Team is missing or already has a captain'; end if;
  if v_status in ('judging', 'completed', 'archived') then
    raise exception 'Teams are locked because judging has started';
  end if;

  with cancelled as (
    update public.team_invitations
    set status = 'cancelled', updated_at = now()
    where team_id = p_team_id and hackathon_id = p_hackathon_id
      and status = 'pending' and is_captain_invite
    returning id
  ) select coalesce(array_agg(id), array[]::uuid[]) into v_cancelled from cancelled;

  insert into public.team_invitations (
    team_id, hackathon_id, email, token, invited_by_clerk_user_id,
    status, expires_at, is_captain_invite
  ) values (
    p_team_id, p_hackathon_id, lower(btrim(p_email)), p_token, p_invited_by,
    'pending', p_expires_at, true
  ) returning id into v_invitation_id;

  update public.teams
  set pending_captain_email = lower(btrim(p_email)), updated_at = now()
  where id = p_team_id and hackathon_id = p_hackathon_id;

  return query select v_invitation_id, v_cancelled;
end;
$$;

create or replace function public.delete_judging_round_atomic(p_hackathon_id uuid, p_round_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_status text; v_hackathon public.hackathons%rowtype;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then return 'not_found'; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    return 'results_published';
  end if;
  select status::text into v_status from public.judging_rounds
  where id = p_round_id and hackathon_id = p_hackathon_id for update;
  if not found then return 'not_found'; end if;
  if v_status = 'active' then return 'round_active'; end if;
  delete from public.prizes where round_id = p_round_id and is_screening;
  update public.prizes set round_id = null, updated_at = now()
  where round_id = p_round_id and hackathon_id = p_hackathon_id;
  delete from public.judging_rounds where id = p_round_id and hackathon_id = p_hackathon_id;
  return 'deleted';
end;
$$;

create or replace function public.remove_judge_atomic(p_hackathon_id uuid, p_judge_participant_id uuid)
returns table(removed boolean, results_stale boolean)
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then return query select false, false; return; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  perform 1 from public.hackathon_participants
  where id = p_judge_participant_id and hackathon_id = p_hackathon_id and role = 'judge'
  for update;
  if not found then return query select false, false; return; end if;
  delete from public.hackathon_judges_display
  where hackathon_id = p_hackathon_id and participant_id = p_judge_participant_id;
  delete from public.hackathon_participants
  where id = p_judge_participant_id and hackathon_id = p_hackathon_id and role = 'judge';
  return query select true, exists(
    select 1 from public.hackathon_results where hackathon_id = p_hackathon_id
  );
end;
$$;

create or replace function public.delete_prize_atomic(p_hackathon_id uuid, p_prize_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype; v_round public.judging_rounds%rowtype;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then return null; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  delete from public.prizes
  where id = p_prize_id and hackathon_id = p_hackathon_id;
  return found;
end;
$$;

create or replace function public.update_judging_round_atomic(
  p_hackathon_id uuid,
  p_round_id uuid,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype; v_round public.judging_rounds%rowtype;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then return null; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  update public.judging_rounds
  set
    name = case when p_updates ? 'name' then p_updates->>'name' else name end,
    round_type = case when p_updates ? 'round_type' then p_updates->>'round_type' else round_type end,
    is_active = case when p_updates ? 'is_active' then (p_updates->>'is_active')::boolean else is_active end,
    display_order = case when p_updates ? 'display_order' then (p_updates->>'display_order')::integer else display_order end,
    status = case when p_updates ? 'status' then (p_updates->>'status')::public.round_status else status end,
    advancement = case when p_updates ? 'advancement' then (p_updates->>'advancement')::public.advancement_rule else advancement end,
    advancement_config = case when p_updates ? 'advancement_config' then p_updates->'advancement_config' else advancement_config end,
    updated_at = now()
  where id = p_round_id and hackathon_id = p_hackathon_id
  returning * into v_round;
  if not found then return null; end if;
  return to_jsonb(v_round);
end;
$$;

create or replace function public.create_judging_round_atomic(
  p_hackathon_id uuid,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype; v_round public.judging_rounds%rowtype;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then return null; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  if btrim(coalesce(p_values->>'name', '')) = '' then raise exception 'Round name is required'; end if;
  insert into public.judging_rounds (
    hackathon_id, name, round_type, is_active, display_order,
    status, advancement, advancement_config
  ) values (
    p_hackathon_id,
    btrim(p_values->>'name'),
    nullif(p_values->>'round_type', ''),
    coalesce((p_values->>'is_active')::boolean, false),
    coalesce(
      (p_values->>'display_order')::integer,
      (select coalesce(max(display_order), -1) + 1 from public.judging_rounds where hackathon_id = p_hackathon_id)
    ),
    coalesce((p_values->>'status')::public.round_status, 'planned'),
    coalesce((p_values->>'advancement')::public.advancement_rule, 'manual'),
    coalesce(p_values->'advancement_config', '{}'::jsonb)
  ) returning * into v_round;
  return to_jsonb(v_round);
end;
$$;

create or replace function public.activate_judging_round_atomic(
  p_hackathon_id uuid,
  p_round_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then return false; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  perform 1 from public.judging_rounds
  where id = p_round_id and hackathon_id = p_hackathon_id for update;
  if not found then return false; end if;
  update public.judging_rounds set is_active = (id = p_round_id), updated_at = now()
  where hackathon_id = p_hackathon_id;
  return true;
end;
$$;

create or replace function public.remove_judge_from_prize_atomic(
  p_hackathon_id uuid,
  p_judge_participant_id uuid,
  p_prize_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype; v_removed integer;
begin
  select * into v_hackathon from public.hackathons
  where id = p_hackathon_id for update;
  if not found then return 0; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  if not exists (
    select 1 from public.hackathon_participants
    where id = p_judge_participant_id and hackathon_id = p_hackathon_id and role = 'judge'
  ) or not exists (
    select 1 from public.prizes
    where id = p_prize_id and hackathon_id = p_hackathon_id
  ) then return 0; end if;
  delete from public.judge_prize_assignments
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id;
  delete from public.judge_picks
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id;
  delete from public.judge_assignments
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id;
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

create or replace function public.replace_prize_results_atomic(
  p_hackathon_id uuid,
  p_prize_id uuid,
  p_results jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb; v_count integer := 0; v_results_published_at timestamptz;
begin
  select results_published_at into v_results_published_at
  from public.hackathons where id = p_hackathon_id for update;
  if not found then raise exception 'Hackathon not found'; end if;
  if v_results_published_at is not null then raise exception 'Results are published'; end if;
  perform 1 from public.prizes
  where id = p_prize_id and hackathon_id = p_hackathon_id for update;
  if not found then raise exception 'Prize not found'; end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then raise exception 'Results must be an array'; end if;
  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    if not exists (select 1 from public.submissions where id = (v_result->>'submission_id')::uuid and hackathon_id = p_hackathon_id) then
      raise exception 'Submission does not belong to this hackathon';
    end if;
  end loop;
  delete from public.hackathon_results where hackathon_id = p_hackathon_id and prize_id = p_prize_id;
  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    insert into public.hackathon_results (
      hackathon_id, submission_id, rank, total_score, weighted_score, judge_count, prize_id, result_kind
    ) values (
      p_hackathon_id, (v_result->>'submission_id')::uuid, (v_result->>'rank')::integer,
      (v_result->>'total_score')::numeric, (v_result->>'weighted_score')::numeric,
      (v_result->>'judge_count')::integer, p_prize_id, 'prize'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.replace_judge_picks_atomic(
  p_hackathon_id uuid,
  p_judge_participant_id uuid,
  p_prize_id uuid,
  p_picks jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pick jsonb;
  v_max_picks integer;
  v_round_id uuid;
  v_count integer;
  v_status public.hackathon_status;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_results_published_at timestamptz;
begin
  if jsonb_typeof(coalesce(p_picks, '[]'::jsonb)) <> 'array' then
    raise exception 'Picks must be an array';
  end if;

  select h.status, h.starts_at, h.ends_at, h.results_published_at
  into v_status, v_starts_at, v_ends_at, v_results_published_at
  from public.hackathons h
  where h.id = p_hackathon_id
  for update;
  if not found then raise exception 'Hackathon not found'; end if;
  if public.effective_hackathon_status(v_status, v_starts_at, v_ends_at)::text not in ('active', 'judging') then
    raise exception 'Judging is closed';
  end if;
  if v_results_published_at is not null then raise exception 'Results are published'; end if;

  select greatest(1, coalesce(max_picks, 1)), round_id
  into v_max_picks, v_round_id
  from public.prizes
  where id = p_prize_id
    and hackathon_id = p_hackathon_id
    and judging_style = 'judges_pick'
  for update;
  if not found then raise exception 'Prize not found'; end if;

  if v_round_id is not null and not exists (
    select 1 from public.judging_rounds
    where id = v_round_id and hackathon_id = p_hackathon_id and status = 'active'
  ) then
    raise exception 'Round is not active';
  end if;

  if not exists (
    select 1 from public.hackathon_participants
    where id = p_judge_participant_id and hackathon_id = p_hackathon_id and role = 'judge'
  ) then
    raise exception 'Judge not found';
  end if;

  v_count := jsonb_array_length(coalesce(p_picks, '[]'::jsonb));
  if v_count > v_max_picks then raise exception 'Too many picks'; end if;
  if v_count <> (
    select count(distinct value->>'submission_id')
    from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb))
  ) then
    raise exception 'Duplicate project';
  end if;

  for v_pick in select value from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) loop
    if not exists (
      select 1
      from public.judge_assignments assignment
      join public.submissions submission on submission.id = assignment.submission_id
      where assignment.hackathon_id = p_hackathon_id
        and assignment.judge_participant_id = p_judge_participant_id
        and assignment.prize_id = p_prize_id
        and assignment.submission_id = (v_pick->>'submission_id')::uuid
        and submission.hackathon_id = p_hackathon_id
    ) then
      raise exception 'Project is not assigned to this judge';
    end if;
  end loop;

  delete from public.judge_picks
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id;

  for v_pick in select value from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) loop
    insert into public.judge_picks (
      hackathon_id, judge_participant_id, prize_id, submission_id, rank, reason, updated_at
    ) values (
      p_hackathon_id,
      p_judge_participant_id,
      p_prize_id,
      (v_pick->>'submission_id')::uuid,
      (v_pick->>'rank')::integer,
      nullif(v_pick->>'reason', ''),
      now()
    );
  end loop;

  update public.judge_assignments
  set
    is_complete = v_count > 0,
    completed_at = case when v_count > 0 then now() else null end
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id;

  return v_count;
end;
$$;

create or replace function public.promote_participant_to_judge_atomic(
  p_hackathon_id uuid,
  p_participant_id uuid
)
returns table(
  success boolean,
  error_code text,
  capacity_handed_off boolean,
  cancelled_invitation_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.hackathon_participants%rowtype;
  v_hackathon public.hackathons%rowtype;
  v_team public.teams%rowtype;
  v_successor text;
  v_cancelled uuid[] := '{}'::uuid[];
begin
  select * into v_hackathon
  from public.hackathons
  where id = p_hackathon_id
  for update;
  if not found then
    return query select false, 'not_found'::text, false, v_cancelled;
    return;
  end if;
  if v_hackathon.status::text in ('completed', 'archived') then
    return query select false, 'status_locked'::text, false, v_cancelled;
    return;
  end if;

  select * into v_participant
  from public.hackathon_participants participant
  where participant.id = p_participant_id
    and participant.hackathon_id = p_hackathon_id
  for update;

  if not found then
    return query select false, 'not_found'::text, false, v_cancelled;
    return;
  end if;

  if v_participant.role = 'judge' then
    return query select true, null::text, false, v_cancelled;
    return;
  end if;

  if v_participant.role <> 'participant' then
    update public.hackathon_participants
    set role = 'judge', team_id = null
    where id = p_participant_id and hackathon_id = p_hackathon_id;
    return query select true, null::text, false, v_cancelled;
    return;
  end if;

  if v_participant.team_id is not null then
    select * into v_team
    from public.teams team
    where team.id = v_participant.team_id and team.hackathon_id = p_hackathon_id
    for update;
  end if;

  if exists (
    select 1
    from public.submissions submission
    where submission.hackathon_id = p_hackathon_id
      and (
        submission.participant_id = p_participant_id
        or (v_participant.team_id is not null and submission.team_id = v_participant.team_id)
      )
  ) then
    return query select false, 'project_role_conflict'::text, false, v_cancelled;
    return;
  end if;

  if v_participant.team_id is not null
    and v_team.captain_clerk_user_id = v_participant.clerk_user_id then
    select participant.clerk_user_id into v_successor
    from public.hackathon_participants participant
    where participant.hackathon_id = p_hackathon_id
      and participant.team_id = v_participant.team_id
      and participant.role = 'participant'
      and participant.id <> p_participant_id
    order by participant.registered_at, participant.id
    limit 1;

    with cancelled as (
      update public.team_invitations invitation
      set status = 'cancelled', updated_at = now()
      where invitation.hackathon_id = p_hackathon_id
        and invitation.team_id = v_participant.team_id
        and invitation.status = 'pending'
        and invitation.is_captain_invite
      returning invitation.id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_cancelled from cancelled;

    update public.teams
    set
      captain_clerk_user_id = v_successor,
      pending_captain_email = null,
      updated_at = now()
    where id = v_participant.team_id and hackathon_id = p_hackathon_id;
  end if;

  update public.hackathon_participants
  set role = 'judge', team_id = null
  where id = p_participant_id and hackathon_id = p_hackathon_id;

  return query select true, null::text, v_participant.team_id is not null and v_team.captain_clerk_user_id = v_participant.clerk_user_id, v_cancelled;
end;
$$;

create or replace function public.accept_judge_invitation_atomic(
  p_token text,
  p_clerk_user_id text,
  p_email text
)
returns table(
  success boolean,
  error_code text,
  hackathon_id uuid,
  hackathon_slug text,
  cancelled_invitation_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.judge_invitations%rowtype;
  v_hackathon public.hackathons%rowtype;
  v_participant public.hackathon_participants%rowtype;
  v_promoted record;
  v_cancelled uuid[] := '{}'::uuid[];
begin
  select * into v_invitation
  from public.judge_invitations invitation
  where invitation.token = p_token
  for update;

  if not found then return query select false, 'not_found'::text, null::uuid, null::text, '{}'::uuid[]; return; end if;
  if v_invitation.status <> 'pending' then return query select false, 'not_pending'::text, null::uuid, null::text, '{}'::uuid[]; return; end if;
  if v_invitation.expires_at <= now() then
    update public.judge_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
    return query select false, 'expired'::text, null::uuid, null::text, '{}'::uuid[];
    return;
  end if;
  if lower(btrim(v_invitation.email)) <> lower(btrim(p_email)) then return query select false, 'email_mismatch'::text, null::uuid, null::text, '{}'::uuid[]; return; end if;

  select * into v_hackathon from public.hackathons hackathon where hackathon.id = v_invitation.hackathon_id for update;
  if not found then return query select false, 'not_found'::text, null::uuid, null::text, '{}'::uuid[]; return; end if;
  if v_hackathon.status::text in ('completed', 'archived') then return query select false, 'hackathon_ended'::text, null::uuid, null::text, '{}'::uuid[]; return; end if;

  select * into v_participant
  from public.hackathon_participants participant
  where participant.hackathon_id = v_invitation.hackathon_id
    and participant.clerk_user_id = p_clerk_user_id
  for update;

  if found then
    if v_participant.role <> 'judge' then
      select * into v_promoted
      from public.promote_participant_to_judge_atomic(v_invitation.hackathon_id, v_participant.id);
      if not v_promoted.success then
        return query select false, v_promoted.error_code, null::uuid, null::text, '{}'::uuid[];
        return;
      end if;
      v_cancelled := coalesce(v_promoted.cancelled_invitation_ids, '{}'::uuid[]);
    end if;
  else
    insert into public.hackathon_participants (hackathon_id, clerk_user_id, role)
    values (v_invitation.hackathon_id, p_clerk_user_id, 'judge');
  end if;

  update public.judge_invitations
  set status = 'accepted', accepted_by_clerk_user_id = p_clerk_user_id, updated_at = now()
  where id = v_invitation.id;

  return query select true, null::text, v_hackathon.id, v_hackathon.slug, v_cancelled;
end;
$$;

create or replace function public.change_judge_role_atomic(
  p_hackathon_id uuid,
  p_participant_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if p_role not in ('participant', 'mentor', 'organizer') then return false; end if;
  select status::text into v_status from public.hackathons where id = p_hackathon_id for update;
  if v_status in ('judging', 'completed', 'archived') then return false; end if;
  perform 1 from public.hackathon_participants
  where id = p_participant_id and hackathon_id = p_hackathon_id and role = 'judge'
  for update;
  if not found then return false; end if;
  delete from public.hackathon_judges_display where hackathon_id = p_hackathon_id and participant_id = p_participant_id;
  delete from public.judge_picks where hackathon_id = p_hackathon_id and judge_participant_id = p_participant_id;
  delete from public.judge_prize_assignments where hackathon_id = p_hackathon_id and judge_participant_id = p_participant_id;
  delete from public.judge_room_assignments where hackathon_id = p_hackathon_id and judge_participant_id = p_participant_id;
  delete from public.judge_assignments where hackathon_id = p_hackathon_id and judge_participant_id = p_participant_id;
  update public.hackathon_participants set role = p_role::public.participant_role, team_id = null
  where id = p_participant_id and hackathon_id = p_hackathon_id;
  return true;
end;
$$;

create or replace function public.change_participant_role_atomic(
  p_hackathon_id uuid,
  p_participant_id uuid,
  p_role text
)
returns table(success boolean, error_code text, capacity_handed_off boolean, cancelled_invitation_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.hackathon_participants%rowtype;
  v_team public.teams%rowtype;
  v_successor text;
  v_cancelled uuid[] := '{}'::uuid[];
  v_status text;
begin
  if p_role = 'judge' then
    return query select * from public.promote_participant_to_judge_atomic(p_hackathon_id, p_participant_id);
    return;
  end if;
  if p_role not in ('mentor', 'organizer') then return query select false, 'invalid_role'::text, false, v_cancelled; return; end if;
  select status::text into v_status from public.hackathons where id = p_hackathon_id for update;
  if v_status in ('judging', 'completed', 'archived') then return query select false, 'status_locked'::text, false, v_cancelled; return; end if;
  select * into v_participant from public.hackathon_participants
  where id = p_participant_id and hackathon_id = p_hackathon_id and role = 'participant' for update;
  if not found then return query select false, 'not_found'::text, false, v_cancelled; return; end if;
  if v_participant.team_id is not null then
    select * into v_team from public.teams where id = v_participant.team_id for update;
    if v_team.captain_clerk_user_id = v_participant.clerk_user_id then
      select clerk_user_id into v_successor from public.hackathon_participants
      where team_id = v_participant.team_id and role = 'participant' and id <> p_participant_id
      order by registered_at, id limit 1;
      with cancelled as (
        update public.team_invitations set status = 'cancelled', updated_at = now()
        where team_id = v_participant.team_id and status = 'pending' and is_captain_invite returning id
      ) select coalesce(array_agg(id), '{}'::uuid[]) into v_cancelled from cancelled;
      update public.teams set captain_clerk_user_id = v_successor, pending_captain_email = null, updated_at = now()
      where id = v_participant.team_id;
    end if;
  end if;
  update public.hackathon_participants set role = p_role::public.participant_role, team_id = null
  where id = p_participant_id;
  return query select true, null::text,
    v_participant.team_id is not null and v_team.captain_clerk_user_id = v_participant.clerk_user_id,
    v_cancelled;
end;
$$;

create or replace function public.change_other_role_atomic(
  p_hackathon_id uuid,
  p_participant_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if p_role not in ('participant', 'judge', 'mentor', 'organizer') then return false; end if;
  select status::text into v_status from public.hackathons
  where id = p_hackathon_id for update;
  if not found or v_status in ('judging', 'completed', 'archived') then return false; end if;
  perform 1 from public.hackathon_participants
  where id = p_participant_id and hackathon_id = p_hackathon_id
    and role in ('mentor', 'organizer')
  for update;
  if not found then return false; end if;
  update public.hackathon_participants
  set role = p_role::public.participant_role, team_id = null
  where id = p_participant_id and hackathon_id = p_hackathon_id;
  return true;
end;
$$;

create or replace function public.assign_participant_to_team_atomic(
  p_hackathon_id uuid,
  p_participant_id uuid,
  p_team_id uuid
)
returns table(success boolean, error_code text, capacity_handed_off boolean, cancelled_invitation_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.hackathon_participants%rowtype;
  v_hackathon public.hackathons%rowtype;
  v_old_team public.teams%rowtype;
  v_new_team public.teams%rowtype;
  v_successor text;
  v_cancelled uuid[] := '{}'::uuid[];
begin
  select * into v_hackathon from public.hackathons where id = p_hackathon_id for update;
  select * into v_participant from public.hackathon_participants
    where id = p_participant_id and hackathon_id = p_hackathon_id for update;
  if not found then return query select false, 'not_found'::text, false, v_cancelled; return; end if;
  if v_hackathon.status::text in ('judging', 'completed', 'archived') then return query select false, 'status_locked'::text, false, v_cancelled; return; end if;
  if v_participant.role <> 'participant' then return query select false, 'not_participant'::text, false, v_cancelled; return; end if;
  if v_participant.team_id = p_team_id or (v_participant.team_id is null and p_team_id is null) then return query select true, null::text, false, v_cancelled; return; end if;

  if p_team_id is not null then
    select * into v_new_team from public.teams where id = p_team_id and hackathon_id = p_hackathon_id for update;
    if not found or v_new_team.status = 'disbanded' then return query select false, 'team_not_found'::text, false, v_cancelled; return; end if;
    if v_hackathon.max_team_size is not null and (
      select count(*) from public.hackathon_participants where team_id = p_team_id and role = 'participant'
    ) >= v_hackathon.max_team_size then return query select false, 'team_full'::text, false, v_cancelled; return; end if;
  end if;

  if v_participant.team_id is not null then
    select * into v_old_team from public.teams where id = v_participant.team_id and hackathon_id = p_hackathon_id for update;
    if v_old_team.captain_clerk_user_id = v_participant.clerk_user_id then
      select clerk_user_id into v_successor from public.hackathon_participants
      where team_id = v_participant.team_id and role = 'participant' and id <> p_participant_id
      order by registered_at, id limit 1;
      with cancelled as (
        update public.team_invitations set status = 'cancelled', updated_at = now()
        where team_id = v_participant.team_id and status = 'pending' and is_captain_invite returning id
      ) select coalesce(array_agg(id), '{}'::uuid[]) into v_cancelled from cancelled;
      update public.teams set captain_clerk_user_id = v_successor, pending_captain_email = null, updated_at = now()
      where id = v_participant.team_id;
    end if;
  end if;
  update public.hackathon_participants set team_id = p_team_id where id = p_participant_id;
  return query select true, null::text,
    v_participant.team_id is not null and v_old_team.captain_clerk_user_id = v_participant.clerk_user_id,
    v_cancelled;
end;
$$;

create or replace function public.remove_participant_from_event_atomic(
  p_hackathon_id uuid,
  p_participant_id uuid
)
returns table(success boolean, error_code text, capacity_handed_off boolean, cancelled_invitation_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.hackathon_participants%rowtype;
  v_hackathon public.hackathons%rowtype;
  v_team public.teams%rowtype;
  v_successor text;
  v_cancelled uuid[] := '{}'::uuid[];
begin
  select * into v_hackathon from public.hackathons where id = p_hackathon_id for update;
  select * into v_participant from public.hackathon_participants
    where id = p_participant_id and hackathon_id = p_hackathon_id for update;
  if not found then return query select false, 'not_found'::text, false, v_cancelled; return; end if;
  if v_hackathon.status::text in ('judging', 'completed', 'archived') then return query select false, 'status_locked'::text, false, v_cancelled; return; end if;
  if v_participant.team_id is not null then
    select * into v_team from public.teams where id = v_participant.team_id for update;
    if v_team.captain_clerk_user_id = v_participant.clerk_user_id then
      select clerk_user_id into v_successor from public.hackathon_participants
      where team_id = v_participant.team_id and role = 'participant' and id <> p_participant_id
      order by registered_at, id limit 1;
      with cancelled as (
        update public.team_invitations set status = 'cancelled', updated_at = now()
        where team_id = v_participant.team_id and status = 'pending' and is_captain_invite returning id
      ) select coalesce(array_agg(id), '{}'::uuid[]) into v_cancelled from cancelled;
      update public.teams set captain_clerk_user_id = v_successor, pending_captain_email = null, updated_at = now()
      where id = v_participant.team_id;
    end if;
  end if;
  delete from public.hackathon_judges_display where hackathon_id = p_hackathon_id and participant_id = p_participant_id;
  delete from public.hackathon_participants where id = p_participant_id and hackathon_id = p_hackathon_id;
  return query select true, null::text,
    v_participant.team_id is not null and v_team.captain_clerk_user_id = v_participant.clerk_user_id,
    v_cancelled;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.submissions
    group by hackathon_id, team_id
    having team_id is not null and count(*) > 1
  ) or exists (
    select 1
    from public.submissions
    group by hackathon_id, participant_id
    having participant_id is not null and count(*) > 1
  ) then
    raise exception 'Duplicate projects must be resolved before adding one-project-per-attendee constraints';
  end if;
end;
$$;

create unique index if not exists submissions_one_per_team
  on public.submissions(hackathon_id, team_id)
  where team_id is not null;
create unique index if not exists submissions_one_per_solo_attendee
  on public.submissions(hackathon_id, participant_id)
  where participant_id is not null;

update public.crowd_votes vote
set prize_id = (
  select prize.id
  from public.prizes prize
  where prize.hackathon_id = vote.hackathon_id
    and (prize.judging_style = 'crowd_vote' or prize.type = 'crowd')
  order by prize.created_at, prize.id
  limit 1
)
where vote.prize_id is null
  and 1 = (
    select count(*)
    from public.prizes prize
    where prize.hackathon_id = vote.hackathon_id
      and (prize.judging_style = 'crowd_vote' or prize.type = 'crowd')
  );

do $$
begin
  if exists (select 1 from public.crowd_votes where prize_id is null) then
    raise exception 'Legacy crowd votes need a prize before this migration can continue';
  end if;
end;
$$;

alter table public.crowd_votes alter column prize_id set not null;
alter table public.crowd_votes drop constraint if exists crowd_votes_prize_id_fkey;
alter table public.crowd_votes add constraint crowd_votes_prize_id_fkey
  foreign key (prize_id) references public.prizes(id) on delete cascade;
alter table public.crowd_votes drop constraint if exists crowd_votes_hackathon_id_clerk_user_id_key;
create unique index if not exists crowd_votes_hackathon_prize_user_unique
  on public.crowd_votes(hackathon_id, prize_id, clerk_user_id);

create or replace function public.cast_crowd_vote_atomic(
  p_hackathon_id uuid,
  p_prize_id uuid,
  p_submission_id uuid,
  p_clerk_user_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype;
begin
  select * into v_hackathon from public.hackathons where id = p_hackathon_id;
  if not found then return 'not_found'; end if;
  if public.effective_hackathon_status(
    v_hackathon.status, v_hackathon.starts_at, v_hackathon.ends_at
  )::text not in ('active', 'judging') then return 'voting_closed'; end if;
  if v_hackathon.results_published_at is not null then return 'voting_closed'; end if;
  if not exists (
    select 1 from public.prizes prize
    where prize.id = p_prize_id and prize.hackathon_id = p_hackathon_id
      and (prize.judging_style = 'crowd_vote' or prize.type = 'crowd')
  ) then return 'invalid_prize'; end if;
  if not exists (
    select 1 from public.submissions submission
    join public.prizes prize
      on prize.id = p_prize_id and prize.hackathon_id = p_hackathon_id
    left join public.teams team on team.id = submission.team_id
    where submission.id = p_submission_id and submission.hackathon_id = p_hackathon_id
      and submission.status = 'submitted'
      and (
        coalesce(cardinality(prize.allowed_team_modes), 0) = 0
        or team.mode = any(prize.allowed_team_modes)
      )
  ) then return 'invalid_project'; end if;

  insert into public.crowd_votes (hackathon_id, prize_id, submission_id, clerk_user_id)
  values (p_hackathon_id, p_prize_id, p_submission_id, p_clerk_user_id)
  on conflict (hackathon_id, prize_id, clerk_user_id)
  do update set submission_id = excluded.submission_id, created_at = now();
  return 'success';
end;
$$;

create or replace function public.remove_crowd_vote_atomic(
  p_hackathon_id uuid,
  p_prize_id uuid,
  p_clerk_user_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_hackathon public.hackathons%rowtype;
begin
  select * into v_hackathon from public.hackathons where id = p_hackathon_id;
  if not found then return 'not_found'; end if;
  if public.effective_hackathon_status(
    v_hackathon.status, v_hackathon.starts_at, v_hackathon.ends_at
  )::text not in ('active', 'judging')
    or v_hackathon.results_published_at is not null then return 'voting_closed'; end if;
  if not exists (
    select 1 from public.prizes prize
    where prize.id = p_prize_id and prize.hackathon_id = p_hackathon_id
      and (prize.judging_style = 'crowd_vote' or prize.type = 'crowd')
  ) then return 'invalid_prize'; end if;

  delete from public.crowd_votes
  where hackathon_id = p_hackathon_id and prize_id = p_prize_id and clerk_user_id = p_clerk_user_id;
  return 'success';
end;
$$;

create or replace function public.get_crowd_vote_counts(p_hackathon_id uuid, p_prize_id uuid)
returns table(submission_id uuid, vote_count bigint)
language sql
security definer
set search_path = public
as $$
  select vote.submission_id, count(*)::bigint
  from public.crowd_votes vote
  join public.prizes prize
    on prize.id = vote.prize_id and prize.hackathon_id = vote.hackathon_id
  join public.submissions submission
    on submission.id = vote.submission_id and submission.hackathon_id = vote.hackathon_id
  left join public.teams team on team.id = submission.team_id
  where vote.hackathon_id = p_hackathon_id and vote.prize_id = p_prize_id
    and (
      coalesce(cardinality(prize.allowed_team_modes), 0) = 0
      or team.mode = any(prize.allowed_team_modes)
    )
  group by vote.submission_id;
$$;

create or replace function public.remove_judge_pick_atomic(
  p_hackathon_id uuid,
  p_judge_participant_id uuid,
  p_prize_id uuid,
  p_submission_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.hackathon_status;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_results_published_at timestamptz;
begin
  select h.status, h.starts_at, h.ends_at, h.results_published_at
  into v_status, v_starts_at, v_ends_at, v_results_published_at
  from public.hackathons h
  where h.id = p_hackathon_id
  for update;
  if not found then raise exception 'Hackathon not found'; end if;
  if public.effective_hackathon_status(v_status, v_starts_at, v_ends_at)::text not in ('active', 'judging') then
    raise exception 'Judging is closed';
  end if;
  if v_results_published_at is not null then raise exception 'Results are published'; end if;
  perform 1 from public.judge_picks
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id
  for update;
  delete from public.judge_picks
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id
    and submission_id = p_submission_id;
  if not found then return false; end if;
  with ranked as (
    select id, row_number() over (order by rank, id)::integer as next_rank
    from public.judge_picks
    where hackathon_id = p_hackathon_id
      and judge_participant_id = p_judge_participant_id
      and prize_id = p_prize_id
  )
  update public.judge_picks pick set rank = ranked.next_rank, updated_at = now()
  from ranked where pick.id = ranked.id;
  update public.judge_assignments
  set
    is_complete = exists (
      select 1 from public.judge_picks
      where hackathon_id = p_hackathon_id
        and judge_participant_id = p_judge_participant_id
        and prize_id = p_prize_id
    ),
    completed_at = case
      when exists (
        select 1 from public.judge_picks
        where hackathon_id = p_hackathon_id
          and judge_participant_id = p_judge_participant_id
          and prize_id = p_prize_id
      ) then coalesce(completed_at, now())
      else null
    end
  where hackathon_id = p_hackathon_id
    and judge_participant_id = p_judge_participant_id
    and prize_id = p_prize_id;
  return true;
end;
$$;

create or replace function public.approve_pending_team(
  p_team_id uuid,
  p_hackathon_id uuid
)
returns table(
  success boolean,
  error_code text,
  error_message text,
  team_id uuid,
  team_name text,
  team_status public.team_status,
  member_clerk_user_ids text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team record;
  v_hackathon_status public.hackathon_status;
  v_now timestamptz := now();
  v_member_clerk_user_ids text[] := array[]::text[];
begin
  select status into v_hackathon_status
  from public.hackathons where id = p_hackathon_id for update;
  if not found then
    return query select false, 'not_found'::text, 'Hackathon not found'::text,
      null::uuid, null::text, null::public.team_status, array[]::text[];
    return;
  end if;
  if v_hackathon_status::text in ('judging', 'completed', 'archived') then
    return query select false, 'status_locked'::text, 'Teams are locked because judging has started'::text,
      null::uuid, null::text, null::public.team_status, array[]::text[];
    return;
  end if;

  select t.id, t.name, t.status into v_team
  from public.teams t
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
  for update;
  if v_team is null then
    return query select false, 'not_found'::text, 'Team not found'::text,
      null::uuid, null::text, null::public.team_status, array[]::text[];
    return;
  end if;
  if v_team.status <> 'pending_approval'::public.team_status then
    return query select false, 'not_pending'::text, 'This team is not waiting for approval'::text,
      v_team.id, v_team.name, v_team.status, array[]::text[];
    return;
  end if;

  select coalesce(array_agg(hp.clerk_user_id) filter (where hp.clerk_user_id is not null), array[]::text[])
  into v_member_clerk_user_ids
  from public.hackathon_participants hp
  where hp.hackathon_id = p_hackathon_id and hp.team_id = p_team_id;

  update public.teams t
  set status = 'forming'::public.team_status, updated_at = v_now
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
    and t.status = 'pending_approval'::public.team_status
  returning t.id, t.name, t.status into v_team;
  if v_team is null then raise exception 'Pending team % could not be approved', p_team_id; end if;

  return query select true, null::text, null::text,
    v_team.id, v_team.name, v_team.status, v_member_clerk_user_ids;
end;
$$;

create or replace function public.deny_pending_team_internal(
  p_team_id uuid,
  p_hackathon_id uuid,
  p_allow_closed boolean
)
returns table(
  success boolean,
  error_code text,
  error_message text,
  team_id uuid,
  team_name text,
  team_status public.team_status,
  members_unassigned integer,
  invites_cancelled integer,
  cancelled_invitation_ids uuid[],
  member_clerk_user_ids text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team record;
  v_hackathon_status public.hackathon_status;
  v_now timestamptz := now();
  v_members_unassigned integer := 0;
  v_invites_cancelled integer := 0;
  v_cancelled_invitation_ids uuid[] := array[]::uuid[];
  v_member_clerk_user_ids text[] := array[]::text[];
begin
  select status into v_hackathon_status
  from public.hackathons where id = p_hackathon_id for update;
  if not found then
    return query select false, 'not_found'::text, 'Hackathon not found'::text,
      null::uuid, null::text, null::public.team_status, 0, 0, array[]::uuid[], array[]::text[];
    return;
  end if;
  if not p_allow_closed and v_hackathon_status::text in ('judging', 'completed', 'archived') then
    return query select false, 'status_locked'::text, 'Teams are locked because judging has started'::text,
      null::uuid, null::text, null::public.team_status, 0, 0, array[]::uuid[], array[]::text[];
    return;
  end if;

  select t.id, t.name, t.status into v_team
  from public.teams t
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
  for update;
  if v_team is null then
    return query select false, 'not_found'::text, 'Team not found'::text,
      null::uuid, null::text, null::public.team_status, 0, 0, array[]::uuid[], array[]::text[];
    return;
  end if;
  if v_team.status <> 'pending_approval'::public.team_status then
    return query select false, 'not_pending'::text, 'This team is not waiting for approval'::text,
      v_team.id, v_team.name, v_team.status, 0, 0, array[]::uuid[], array[]::text[];
    return;
  end if;

  select coalesce(array_agg(hp.clerk_user_id order by hp.clerk_user_id)
    filter (where hp.clerk_user_id is not null), array[]::text[]), count(*)::integer
  into v_member_clerk_user_ids, v_members_unassigned
  from public.hackathon_participants hp
  where hp.team_id = p_team_id and hp.hackathon_id = p_hackathon_id;

  select coalesce(array_agg(ti.id order by ti.id), array[]::uuid[])
  into v_cancelled_invitation_ids
  from public.team_invitations ti
  where ti.team_id = p_team_id and ti.hackathon_id = p_hackathon_id and ti.status = 'pending';

  update public.teams t
  set status = 'disbanded'::public.team_status, captain_clerk_user_id = null,
    pending_captain_email = null, updated_at = v_now
  where t.id = p_team_id and t.hackathon_id = p_hackathon_id
    and t.status = 'pending_approval'::public.team_status
  returning t.id, t.name, t.status into v_team;
  if v_team is null then raise exception 'Pending team % could not be denied', p_team_id; end if;

  update public.hackathon_participants set team_id = null
  where team_id = p_team_id and hackathon_id = p_hackathon_id;
  update public.team_invitations set status = 'cancelled', updated_at = v_now
  where id = any(v_cancelled_invitation_ids);
  get diagnostics v_invites_cancelled = row_count;
  delete from public.room_teams where team_id = p_team_id;

  return query select true, null::text, null::text,
    v_team.id, v_team.name, v_team.status, v_members_unassigned,
    v_invites_cancelled, v_cancelled_invitation_ids, v_member_clerk_user_ids;
end;
$$;

create or replace function public.deny_pending_team(p_team_id uuid, p_hackathon_id uuid)
returns table(
  success boolean, error_code text, error_message text, team_id uuid, team_name text,
  team_status public.team_status, members_unassigned integer, invites_cancelled integer,
  cancelled_invitation_ids uuid[], member_clerk_user_ids text[]
)
language sql
security definer
set search_path = public
as $$
  select * from public.deny_pending_team_internal(p_team_id, p_hackathon_id, false);
$$;

create or replace function public.deny_pending_team_for_closeout(p_team_id uuid, p_hackathon_id uuid)
returns table(
  success boolean, error_code text, error_message text, team_id uuid, team_name text,
  team_status public.team_status, members_unassigned integer, invites_cancelled integer,
  cancelled_invitation_ids uuid[], member_clerk_user_ids text[]
)
language sql
security definer
set search_path = public
as $$
  select * from public.deny_pending_team_internal(p_team_id, p_hackathon_id, true);
$$;

create or replace function public.seed_default_core_criteria_atomic(p_hackathon_id uuid, p_criteria jsonb)
returns setof public.judging_criteria
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_hackathon public.hackathons%rowtype;
begin
  select * into v_hackathon from public.hackathons where id = p_hackathon_id for update;
  if not found then raise exception 'Hackathon not found'; end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  if exists (select 1 from public.judging_criteria where hackathon_id = p_hackathon_id and prize_id is null) then
    raise exception 'Core categories already exist';
  end if;
  for v_item in select value from jsonb_array_elements(p_criteria) loop
    insert into public.judging_criteria (
      hackathon_id, prize_id, name, description, min_score, max_score, weight, display_order
    ) values (
      p_hackathon_id, null, v_item->>'name', nullif(v_item->>'description', ''),
      (v_item->>'min_score')::numeric, (v_item->>'max_score')::numeric,
      (v_item->>'weight')::numeric, (v_item->>'display_order')::integer
    );
  end loop;
  return query select * from public.judging_criteria
    where hackathon_id = p_hackathon_id and prize_id is null order by display_order;
end;
$$;

create or replace function public.resolve_captain_invitation_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' and new.is_captain_invite then
    update public.teams
    set pending_captain_email = null, updated_at = now()
    where id = new.team_id
      and hackathon_id = new.hackathon_id
      and captain_clerk_user_id is null
      and lower(pending_captain_email) = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists resolve_captain_invitation_marker on public.team_invitations;
create trigger resolve_captain_invitation_marker
after update of status on public.team_invitations
for each row execute function public.resolve_captain_invitation_marker();

do $$
begin
  if exists (
    with duplicate_invites as (
      select id, team_id, row_number() over (
        partition by hackathon_id, lower(email) order by created_at, id
      ) as duplicate_number
      from public.team_invitations
      where status = 'pending' and is_captain_invite
    )
    select 1
    from duplicate_invites duplicate
    join public.teams team on team.id = duplicate.team_id
    where duplicate.duplicate_number > 1
      and (
        team.captain_clerk_user_id is not null
        or exists (select 1 from public.hackathon_participants where team_id = team.id)
        or exists (select 1 from public.submissions where team_id = team.id)
        or exists (select 1 from public.room_teams where team_id = team.id)
        or exists (
          select 1 from public.team_invitations invitation
          where invitation.team_id = team.id
            and invitation.status = 'pending'
            and invitation.id <> duplicate.id
        )
      )
  ) then
    raise exception 'Ambiguous duplicate captain invites need manual cleanup before migration';
  end if;
end;
$$;

with duplicate_invites as (
  select id, team_id, row_number() over (
    partition by hackathon_id, lower(email) order by created_at, id
  ) as duplicate_number
  from public.team_invitations
  where status = 'pending' and is_captain_invite
), cancelled as (
  update public.team_invitations invitation
  set status = 'cancelled', updated_at = now()
  from duplicate_invites duplicate
  where invitation.id = duplicate.id and duplicate.duplicate_number > 1
  returning invitation.team_id
)
update public.teams team
set status = 'disbanded', pending_captain_email = null, updated_at = now()
where team.id in (select team_id from cancelled) and team.captain_clerk_user_id is null;

create unique index if not exists team_invitations_one_pending_captain_per_email
on public.team_invitations(hackathon_id, lower(email))
where status = 'pending' and is_captain_invite;

create or replace function public.reorder_sponsors_atomic(p_hackathon_id uuid, p_sponsor_ids jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer; v_expected integer;
begin
  if jsonb_typeof(coalesce(p_sponsor_ids, '[]'::jsonb)) <> 'array' then raise exception 'Sponsor IDs must be an array'; end if;
  v_expected := jsonb_array_length(coalesce(p_sponsor_ids, '[]'::jsonb));
  if v_expected <> (select count(distinct value) from jsonb_array_elements_text(coalesce(p_sponsor_ids, '[]'::jsonb))) then
    return false;
  end if;
  select count(*) into v_count from public.hackathon_sponsors
  where hackathon_id = p_hackathon_id and id in (
    select value::uuid from jsonb_array_elements_text(coalesce(p_sponsor_ids, '[]'::jsonb))
  );
  if v_count <> v_expected then return false; end if;
  update public.hackathon_sponsors sponsor
  set display_order = ordered.position - 1
  from (
    select value::uuid as id, ordinality::integer as position
    from jsonb_array_elements_text(coalesce(p_sponsor_ids, '[]'::jsonb)) with ordinality
  ) ordered
  where sponsor.id = ordered.id and sponsor.hackathon_id = p_hackathon_id;
  return true;
end;
$$;

create or replace function public.prevent_published_judging_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hackathon_id uuid;
  v_hackathon public.hackathons%rowtype;
begin
  v_hackathon_id := case when tg_op = 'DELETE' then old.hackathon_id else new.hackathon_id end;
  select * into v_hackathon from public.hackathons
  where id = v_hackathon_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.prevent_published_child_judging_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_hackathon_id uuid;
  v_hackathon public.hackathons%rowtype;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;

  if tg_table_name = 'bucket_definitions' then
    select coalesce(prize.hackathon_id, round.hackathon_id) into v_hackathon_id
    from (select v_row.prize_id as prize_id, v_row.round_id as round_id) source
    left join public.prizes prize on prize.id = source.prize_id
    left join public.judging_rounds round on round.id = source.round_id;
  else
    select assignment.hackathon_id into v_hackathon_id
    from public.judge_assignments assignment
    where assignment.id = v_row.judge_assignment_id;
  end if;

  if v_hackathon_id is null then
    raise exception 'Judging record has no event';
  end if;

  select * into v_hackathon from public.hackathons
  where id = v_hackathon_id for update;
  if v_hackathon.results_published_at is not null
    or v_hackathon.status::text in ('completed', 'archived') then
    raise exception 'Published judging setup is locked';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_published_prize_mutation on public.prizes;
create trigger prevent_published_prize_mutation
before insert or update or delete on public.prizes
for each row execute function public.prevent_published_judging_mutation();

drop trigger if exists prevent_published_round_mutation on public.judging_rounds;
create trigger prevent_published_round_mutation
before insert or update or delete on public.judging_rounds
for each row execute function public.prevent_published_judging_mutation();

drop trigger if exists prevent_published_assignment_mutation on public.judge_assignments;
create trigger prevent_published_assignment_mutation
before insert or update or delete on public.judge_assignments
for each row execute function public.prevent_published_judging_mutation();

drop trigger if exists prevent_published_judge_prize_mutation on public.judge_prize_assignments;
create trigger prevent_published_judge_prize_mutation
before insert or update or delete on public.judge_prize_assignments
for each row execute function public.prevent_published_judging_mutation();

drop trigger if exists prevent_published_pick_mutation on public.judge_picks;
create trigger prevent_published_pick_mutation
before insert or update or delete on public.judge_picks
for each row execute function public.prevent_published_judging_mutation();

drop trigger if exists prevent_published_criteria_mutation on public.judging_criteria;
create trigger prevent_published_criteria_mutation
before insert or update or delete on public.judging_criteria
for each row execute function public.prevent_published_judging_mutation();

drop trigger if exists prevent_published_bucket_definition_mutation on public.bucket_definitions;
create trigger prevent_published_bucket_definition_mutation
before insert or update or delete on public.bucket_definitions
for each row execute function public.prevent_published_child_judging_mutation();

drop trigger if exists prevent_published_score_mutation on public.scores;
create trigger prevent_published_score_mutation
before insert or update or delete on public.scores
for each row execute function public.prevent_published_child_judging_mutation();

drop trigger if exists prevent_published_binary_response_mutation on public.binary_responses;
create trigger prevent_published_binary_response_mutation
before insert or update or delete on public.binary_responses
for each row execute function public.prevent_published_child_judging_mutation();

drop trigger if exists prevent_published_bucket_response_mutation on public.bucket_responses;
create trigger prevent_published_bucket_response_mutation
before insert or update or delete on public.bucket_responses
for each row execute function public.prevent_published_child_judging_mutation();

create or replace function public.reorder_challenges_atomic(
  p_hackathon_id uuid,
  p_ordered_ids jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_count integer;
  v_input_count integer;
begin
  perform 1 from public.hackathons where id = p_hackathon_id for update;
  if not found then return false; end if;
  if jsonb_typeof(coalesce(p_ordered_ids, 'null'::jsonb)) <> 'array' then return false; end if;

  select count(*) into v_expected_count
  from public.challenges
  where hackathon_id = p_hackathon_id;

  select count(*) into v_input_count
  from jsonb_array_elements_text(p_ordered_ids);

  if v_input_count <> v_expected_count then return false; end if;
  if (
    select count(distinct value)
    from jsonb_array_elements_text(p_ordered_ids)
  ) <> v_input_count then return false; end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_ordered_ids) item(value)
    left join public.challenges challenge
      on challenge.id = item.value::uuid
      and challenge.hackathon_id = p_hackathon_id
    where challenge.id is null
  ) then return false; end if;

  update public.challenges challenge
  set sort_order = ordered.ordinality - 1,
      updated_at = now()
  from jsonb_array_elements_text(p_ordered_ids) with ordinality ordered(value, ordinality)
  where challenge.id = ordered.value::uuid
    and challenge.hackathon_id = p_hackathon_id;

  return true;
end;
$$;

revoke all on function public.save_prize_configuration_atomic(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_prize_configuration_atomic(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.replace_core_results_atomic(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.clear_judge_assignments_atomic(uuid) from public, anon, authenticated;
revoke all on function public.modify_team_member_atomic(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.prevent_team_delete_with_projects() from public, anon, authenticated;
revoke all on function public.delete_team_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.replace_captain_invitation_atomic(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.delete_judging_round_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_judge_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_prize_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_judging_round_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_judging_round_atomic(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.activate_judging_round_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_judge_from_prize_atomic(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.replace_prize_results_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.replace_judge_picks_atomic(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.promote_participant_to_judge_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.accept_judge_invitation_atomic(text, text, text) from public, anon, authenticated;
revoke all on function public.change_judge_role_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.change_participant_role_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.change_other_role_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.assign_participant_to_team_atomic(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_participant_from_event_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cast_crowd_vote_atomic(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.remove_crowd_vote_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_crowd_vote_counts(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_judge_pick_atomic(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_pending_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.deny_pending_team_internal(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.deny_pending_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.deny_pending_team_for_closeout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.seed_default_core_criteria_atomic(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_captain_invitation_marker() from public, anon, authenticated;
revoke all on function public.reorder_sponsors_atomic(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.prevent_published_judging_mutation() from public, anon, authenticated;
revoke all on function public.prevent_published_child_judging_mutation() from public, anon, authenticated;
revoke all on function public.submit_scores(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.calculate_results(uuid) from public, anon, authenticated;
revoke all on function public.reorder_challenges_atomic(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.save_prize_configuration_atomic(uuid, uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.create_prize_configuration_atomic(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.replace_core_results_atomic(uuid, jsonb) to service_role;
grant execute on function public.reorder_challenges_atomic(uuid, jsonb) to service_role;
grant execute on function public.clear_judge_assignments_atomic(uuid) to service_role;
grant execute on function public.modify_team_member_atomic(uuid, uuid, text, text) to service_role;
grant execute on function public.prevent_team_delete_with_projects() to service_role;
grant execute on function public.delete_team_atomic(uuid, uuid) to service_role;
grant execute on function public.replace_captain_invitation_atomic(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.delete_judging_round_atomic(uuid, uuid) to service_role;
grant execute on function public.remove_judge_atomic(uuid, uuid) to service_role;
grant execute on function public.delete_prize_atomic(uuid, uuid) to service_role;
grant execute on function public.update_judging_round_atomic(uuid, uuid, jsonb) to service_role;
grant execute on function public.create_judging_round_atomic(uuid, jsonb) to service_role;
grant execute on function public.activate_judging_round_atomic(uuid, uuid) to service_role;
grant execute on function public.remove_judge_from_prize_atomic(uuid, uuid, uuid) to service_role;
grant execute on function public.replace_prize_results_atomic(uuid, uuid, jsonb) to service_role;
grant execute on function public.replace_judge_picks_atomic(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.promote_participant_to_judge_atomic(uuid, uuid) to service_role;
grant execute on function public.accept_judge_invitation_atomic(text, text, text) to service_role;
grant execute on function public.change_judge_role_atomic(uuid, uuid, text) to service_role;
grant execute on function public.change_participant_role_atomic(uuid, uuid, text) to service_role;
grant execute on function public.change_other_role_atomic(uuid, uuid, text) to service_role;
grant execute on function public.assign_participant_to_team_atomic(uuid, uuid, uuid) to service_role;
grant execute on function public.remove_participant_from_event_atomic(uuid, uuid) to service_role;
grant execute on function public.cast_crowd_vote_atomic(uuid, uuid, uuid, text) to service_role;
grant execute on function public.remove_crowd_vote_atomic(uuid, uuid, text) to service_role;
grant execute on function public.get_crowd_vote_counts(uuid, uuid) to service_role;
grant execute on function public.remove_judge_pick_atomic(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.approve_pending_team(uuid, uuid) to service_role;
grant execute on function public.deny_pending_team(uuid, uuid) to service_role;
grant execute on function public.deny_pending_team_for_closeout(uuid, uuid) to service_role;
grant execute on function public.seed_default_core_criteria_atomic(uuid, jsonb) to service_role;
grant execute on function public.reorder_sponsors_atomic(uuid, jsonb) to service_role;
grant execute on function public.prevent_published_judging_mutation() to service_role;
grant execute on function public.prevent_published_child_judging_mutation() to service_role;
grant execute on function public.submit_scores(uuid, jsonb, text) to service_role;
grant execute on function public.calculate_results(uuid) to service_role;
