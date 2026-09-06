alter table public.prizes add column if not exists judge_scope text not null default 'all' check (judge_scope in ('all', 'selected'));
alter table public.hackathon_participants add column if not exists judging_prize_scope text not null default 'all' check (judging_prize_scope in ('all', 'selected'));
alter table public.hackathon_participants add column if not exists judging_scope_ready boolean not null default true;
alter table public.judge_assignments add column if not exists scoring_scope text not null default 'legacy_unscoped' check (scoring_scope in ('legacy_unscoped', 'scoped'));
alter table public.judge_assignments alter column scoring_scope set default 'scoped';

create table public.judge_assignment_prizes (
  assignment_id uuid not null references public.judge_assignments(id) on delete cascade,
  prize_id uuid not null references public.prizes(id) on delete cascade,
  primary key (assignment_id, prize_id)
);
alter table public.judge_assignment_prizes enable row level security;
revoke all on public.judge_assignment_prizes from anon, authenticated;
grant all on public.judge_assignment_prizes to service_role;
insert into public.judge_assignment_prizes(assignment_id,prize_id)
select a.id,p.id from public.judge_assignments a join public.prizes p on p.hackathon_id=a.hackathon_id and p.judging_style='weighted_score'
where a.assignment_kind='unified_weighted_score' and a.scoring_scope='legacy_unscoped'
on conflict do nothing;

create table public.judging_distribution_receipts (
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  request_key text not null check (length(request_key) between 8 and 100),
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (hackathon_id, request_key)
);
alter table public.judging_distribution_receipts enable row level security;
revoke all on public.judging_distribution_receipts from anon, authenticated;
grant all on public.judging_distribution_receipts to service_role;

create or replace function public.judging_prize_assignment_eligible(p_assignment_id uuid, p_prize_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.judge_assignments a
    join public.prizes p on p.id = p_prize_id and p.hackathon_id = a.hackathon_id
    join public.hackathon_participants j on j.id = a.judge_participant_id and j.hackathon_id = a.hackathon_id and j.role = 'judge' and j.judging_scope_ready
    join public.submissions s on s.id = a.submission_id and s.hackathon_id = a.hackathon_id and s.status = 'submitted'
    left join public.teams t on t.id = s.team_id
    where a.id = p_assignment_id
      and (j.team_id is null or s.team_id is distinct from j.team_id)
      and p.round_id is not distinct from a.round_id
      and (p.judge_scope = 'all' or exists (select 1 from public.judge_prize_assignments jp where jp.judge_participant_id = j.id and jp.prize_id = p.id))
      and (j.judging_prize_scope = 'all' or exists (select 1 from public.judge_prize_assignments jp where jp.judge_participant_id = j.id and jp.prize_id = p.id))
      and (coalesce(cardinality(p.allowed_team_modes), 0) = 0 or t.mode = any(p.allowed_team_modes))
      and (not exists (select 1 from public.judge_room_assignments jr where jr.judge_participant_id = j.id)
        or exists (select 1 from public.judge_room_assignments jr join public.room_teams rt on rt.room_id = jr.room_id where jr.judge_participant_id = j.id and rt.team_id = s.team_id))
      and (p.round_id is null or not exists (select 1 from public.round_submissions rs where rs.round_id = p.round_id)
        or exists (select 1 from public.round_submissions rs where rs.round_id = p.round_id and rs.submission_id = s.id))
  );
$$;

create or replace function public.attach_judging_assignment_prizes()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.scoring_scope='legacy_unscoped' and new.assignment_kind='unified_weighted_score' then
    insert into public.judge_assignment_prizes(assignment_id,prize_id)
    select new.id,p.id from public.prizes p where p.hackathon_id=new.hackathon_id and p.judging_style='weighted_score'
    on conflict do nothing;
  end if;
  if new.scoring_scope = 'scoped' and new.assignment_kind = 'unified_weighted_score' then
    insert into public.judge_assignment_prizes(assignment_id, prize_id)
    select new.id, p.id from public.prizes p
    where p.hackathon_id = new.hackathon_id and p.judging_style = 'weighted_score'
      and public.judging_prize_assignment_eligible(new.id, p.id)
    on conflict do nothing;
    if not exists(select 1 from public.judge_assignment_prizes where assignment_id=new.id) then raise exception 'This judge has no eligible prize for this project'; end if;
  end if;
  if new.scoring_scope='scoped' and new.assignment_kind='per_prize' then
    if not public.judging_prize_assignment_eligible(new.id,new.prize_id) then raise exception 'This project is outside the judge''s prizes or rooms'; end if;
    insert into public.judge_assignment_prizes(assignment_id,prize_id) values(new.id,new.prize_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger attach_judging_assignment_prizes after insert on public.judge_assignments
for each row execute function public.attach_judging_assignment_prizes();

create or replace function public.lock_judging_assignment_configuration()
returns trigger language plpgsql security invoker set search_path='' as $$
declare h public.hackathons%rowtype;
begin
  select * into h from public.hackathons where id=coalesce(new.hackathon_id,old.hackathon_id) for update;
  if not found then return coalesce(new,old); end if;
  if tg_op='INSERT' and (h.status::text in ('completed','archived') or h.results_published_at is not null) then raise exception 'Judging assignments are closed'; end if;
  if tg_op='UPDATE' and new.hackathon_id is distinct from old.hackathon_id then raise exception 'Assignments cannot be moved to another event'; end if;
  if tg_op='UPDATE' and old.is_complete and
    (new.scoring_scope,new.prize_id,new.round_id,new.judge_participant_id,new.submission_id,new.assignment_kind)
    is distinct from (old.scoring_scope,old.prize_id,old.round_id,old.judge_participant_id,old.submission_id,old.assignment_kind) then
    raise exception 'judging_rules_locked: Submitted scorecards cannot be moved to different prizes or judges';
  end if;
  if tg_op='DELETE' and old.is_complete then raise exception 'judging_rules_locked: Keep submitted reviews. Start a new round for different assignments'; end if;
  return coalesce(new,old);
end;
$$;
create trigger lock_judging_assignment_configuration before insert or update or delete on public.judge_assignments
for each row execute function public.lock_judging_assignment_configuration();
revoke all on function public.lock_judging_assignment_configuration() from public,anon,authenticated;
grant execute on function public.lock_judging_assignment_configuration() to service_role;

create or replace function public.protect_judging_assignment_coverage()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.judge_assignments%rowtype;
begin
  select * into a from public.judge_assignments where id=coalesce(new.assignment_id,old.assignment_id);
  if not found then return coalesce(new,old); end if;
  perform 1 from public.hackathons where id=a.hackathon_id for update;
  if not found then return coalesce(new,old); end if;
  select * into a from public.judge_assignments where id=a.id for update;
  if not found then return coalesce(new,old); end if;
  if tg_op='UPDATE' then raise exception 'Replace unsubmitted prize coverage instead of moving it'; end if;
  if a.is_complete and not(tg_op='INSERT' and pg_trigger_depth()>1) then raise exception 'judging_rules_locked: Submitted prize coverage cannot change'; end if;
  if tg_op='INSERT' then
    if not exists(select 1 from public.prizes p where p.id=new.prize_id and p.hackathon_id=a.hackathon_id
      and ((a.assignment_kind='unified_weighted_score' and p.judging_style='weighted_score') or (a.assignment_kind='per_prize' and a.prize_id=p.id))) then raise exception 'Invalid prize coverage'; end if;
    if a.scoring_scope='scoped' and not public.judging_prize_assignment_eligible(a.id,new.prize_id) then raise exception 'This judge cannot review this prize'; end if;
  end if;
  return coalesce(new,old);
end;
$$;
create trigger protect_judging_assignment_coverage before insert or update or delete on public.judge_assignment_prizes for each row execute function public.protect_judging_assignment_coverage();
revoke all on function public.protect_judging_assignment_coverage() from public,anon,authenticated;
grant execute on function public.protect_judging_assignment_coverage() to service_role;

create or replace function public.get_judging_assignment_scope(p_assignment_id uuid, p_hackathon_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  a public.judge_assignments%rowtype;
  prize_ids uuid[];
  criteria jsonb;
  definition jsonb;
begin
  select * into a from public.judge_assignments where id = p_assignment_id and hackathon_id = p_hackathon_id;
  if not found then return null; end if;
  if a.assignment_kind = 'unified_weighted_score' then
    if a.scoring_scope = 'legacy_unscoped' then
      select coalesce(array_agg(ap.prize_id order by ap.prize_id), '{}') into prize_ids from public.judge_assignment_prizes ap where ap.assignment_id=a.id;
    else
      select coalesce(array_agg(ap.prize_id order by ap.prize_id), '{}') into prize_ids
      from public.judge_assignment_prizes ap where ap.assignment_id = a.id
        and public.judging_prize_assignment_eligible(a.id, ap.prize_id);
      if cardinality(prize_ids) = 0 then raise exception 'This scorecard has no eligible prizes'; end if;
    end if;
  elsif a.prize_id is not null then
    if a.scoring_scope='scoped' and not public.judging_prize_assignment_eligible(a.id,a.prize_id) then raise exception 'This judge cannot review this prize'; end if;
    prize_ids := array[a.prize_id];
  else
    prize_ids := '{}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'description', c.description,
    'min_score', c.min_score, 'max_score', c.max_score, 'weight', c.weight,
    'prize_id', c.prize_id, 'prize_name', p.name, 'category', c.category
  ) order by c.prize_id nulls first, c.display_order, c.id), '[]') into criteria
  from public.judging_criteria c left join public.prizes p on p.id = c.prize_id
  where c.hackathon_id = a.hackathon_id and (
    (c.prize_id is null and (a.assignment_kind = 'unified_weighted_score' or a.prize_id is null))
    or c.prize_id = any(prize_ids)
  );
  definition := jsonb_build_object(
    'criteria', criteria,
    'prizes', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'style', p.judging_style, 'picks', p.max_picks, 'round', p.round_id, 'scope', p.judge_scope, 'modes', p.allowed_team_modes) order by p.id), '[]') from public.prizes p where p.id = any(prize_ids)),
    'buckets', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]') from public.bucket_definitions b where b.prize_id = any(prize_ids)),
    'levels', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]') from public.rubric_levels l where l.criteria_id in (select (v->>'id')::uuid from jsonb_array_elements(criteria) v))
  );
  return jsonb_build_object('prizeIds', to_jsonb(prize_ids), 'criteria', criteria, 'scopeMode', a.scoring_scope, 'criteriaVersion', md5(definition::text));
end;
$$;

create or replace function public.assert_judging_assignment_scope(p_assignment_id uuid, p_expected_criteria_version text)
returns void language plpgsql security invoker set search_path = '' as $$
declare a public.judge_assignments%rowtype; scope jsonb;
begin
  select * into a from public.judge_assignments where id = p_assignment_id;
  if not found then raise exception 'Assignment not found'; end if;
  perform 1 from public.hackathons where id = a.hackathon_id for update;
  perform 1 from public.judge_assignments where id = a.id for update;
  scope := public.get_judging_assignment_scope(a.id, a.hackathon_id);
  if scope->>'criteriaVersion' is distinct from p_expected_criteria_version then
    raise exception 'scorecard_changed: Review the updated scorecard before submitting';
  end if;
end;
$$;

create or replace function public.get_judging_distribution_snapshot(p_hackathon_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare h public.hackathons%rowtype; snapshot jsonb;
begin
  select * into h from public.hackathons where id = p_hackathon_id;
  if not found then return null; end if;
  snapshot := jsonb_build_object(
    'hackathonId', h.id, 'updatedAt', h.updated_at,
    'activeRoundId',(select r.id from public.judging_rounds r where r.hackathon_id=h.id and r.status='active' order by r.display_order,r.id limit 1),
    'closed', h.status::text in ('completed','archived') or h.results_published_at is not null,
    'coreCategoryCount', (select count(*) from public.judging_criteria c where c.hackathon_id = h.id and c.prize_id is null),
    'judges', (select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'name',coalesce(j.clerk_user_id,'Judge'),'teamId',j.team_id,'prizeScope',j.judging_prize_scope,
      'prizeIds',(select coalesce(jsonb_agg(jp.prize_id order by jp.prize_id),'[]') from public.judge_prize_assignments jp where jp.judge_participant_id=j.id),
      'roomIds',(select coalesce(jsonb_agg(jr.room_id order by jr.room_id),'[]') from public.judge_room_assignments jr where jr.judge_participant_id=j.id)) order by j.id),'[]') from public.hackathon_participants j where j.hackathon_id=h.id and j.role='judge' and j.judging_scope_ready),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'teamId',s.team_id,'mode',t.mode,
      'roomIds',(select coalesce(jsonb_agg(rt.room_id order by rt.room_id),'[]') from public.room_teams rt where rt.team_id=s.team_id),
      'roomId',(select rt.room_id from public.room_teams rt where rt.team_id=s.team_id order by rt.room_id limit 1)) order by s.id),'[]') from public.submissions s left join public.teams t on t.id=s.team_id where s.hackathon_id=h.id and s.status='submitted'),
    'prizes', (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'style',p.judging_style,'roundId',p.round_id,'judgeScope',p.judge_scope,'allowedTeamModes',p.allowed_team_modes,
      'judgeIds',(select coalesce(jsonb_agg(jp.judge_participant_id order by jp.judge_participant_id),'[]') from public.judge_prize_assignments jp where jp.prize_id=p.id),
      'projectIds',(select coalesce(jsonb_agg(s.id order by s.id),'[]') from public.submissions s where s.hackathon_id=h.id and s.status='submitted' and (p.round_id is null or not exists(select 1 from public.round_submissions rs where rs.round_id=p.round_id) or exists(select 1 from public.round_submissions rs where rs.round_id=p.round_id and rs.submission_id=s.id))),
      'categoryCount',(select count(*) from public.judging_criteria c where c.prize_id=p.id)) order by p.id),'[]') from public.prizes p left join public.judging_rounds r on r.id=p.round_id where p.hackathon_id=h.id and p.judging_style is not null and (p.round_id is null or r.status::text in ('planned','active'))),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'judgeId',a.judge_participant_id,'projectId',a.submission_id,'prizeId',a.prize_id,'roundId',a.round_id,'kind',a.assignment_kind,'complete',a.is_complete,'scopeMode',a.scoring_scope,
      'prizeIds',(select coalesce(jsonb_agg(ap.prize_id order by ap.prize_id),'[]') from public.judge_assignment_prizes ap where ap.assignment_id=a.id)) order by a.id),'[]') from public.judge_assignments a where a.hackathon_id=h.id)
  );
  return snapshot || jsonb_build_object('version',md5(snapshot::text));
end;
$$;

create or replace function public.apply_judging_distribution(p_hackathon_id uuid, p_expected_version text, p_request_key text, p_target integer, p_assignments jsonb, p_summary jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  snapshot jsonb; item jsonb; a_id uuid; p_id uuid; n integer := 0; coverage_count integer := 0;
  receipt public.judging_distribution_receipts%rowtype; fingerprint text; result jsonb;
  judge_row public.hackathon_participants%rowtype; submission_row public.submissions%rowtype;
begin
  if p_request_key is null or p_target is null or length(p_request_key) not between 8 and 100 or p_target not between 1 and 20 then raise exception 'Invalid distribution request'; end if;
  perform 1 from public.hackathons where id=p_hackathon_id for update;
  if not found then raise exception 'Hackathon not found'; end if;
  fingerprint := md5(jsonb_build_object('version',p_expected_version,'target',p_target)::text);
  select * into receipt from public.judging_distribution_receipts where hackathon_id=p_hackathon_id and request_key=p_request_key;
  if found then
    if receipt.fingerprint <> fingerprint then raise exception 'This request key was already used for another plan'; end if;
    return receipt.result;
  end if;
  snapshot := public.get_judging_distribution_snapshot(p_hackathon_id);
  if (snapshot->>'closed')::boolean then raise exception 'Judging assignments are closed'; end if;
  if snapshot->>'version' is distinct from p_expected_version then raise exception 'Judging changed. Review the assignments again.'; end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments)>10000 then raise exception 'Invalid assignment plan'; end if;
  for item in select value from jsonb_array_elements(p_assignments) loop
    select * into judge_row from public.hackathon_participants where id=(item->>'judgeId')::uuid and hackathon_id=p_hackathon_id and role='judge' and judging_scope_ready;
    if not found then raise exception 'Judge is no longer available'; end if;
    select * into submission_row from public.submissions where id=(item->>'projectId')::uuid and hackathon_id=p_hackathon_id and status='submitted';
    if not found then raise exception 'Project is no longer available'; end if;
    if judge_row.team_id is not null and judge_row.team_id=submission_row.team_id then raise exception 'Judges cannot review their own team'; end if;
    if item->>'kind' is null or item->>'kind' not in ('unified_weighted_score','per_prize') then raise exception 'Invalid assignment kind'; end if;
    if (item->>'kind'='unified_weighted_score' and item->>'prizeId' is not null)
      or (item->>'kind'='per_prize' and item->>'prizeId' is null)
      or jsonb_typeof(item->'prizeIds') is distinct from 'array'
      or jsonb_array_length(item->'prizeIds')=0 then raise exception 'Invalid prize coverage'; end if;
    insert into public.judge_assignments(hackathon_id,judge_participant_id,submission_id,prize_id,round_id,assignment_kind,scoring_scope)
    values(p_hackathon_id,judge_row.id,submission_row.id,(item->>'prizeId')::uuid,(item->>'roundId')::uuid,item->>'kind','scoped')
    on conflict do nothing returning id into a_id;
    if a_id is null then continue; end if;
    n := n+1;
    for p_id in select value::uuid from jsonb_array_elements_text(item->'prizeIds') loop
      if not public.judging_prize_assignment_eligible(a_id,p_id) then raise exception 'Prize eligibility changed'; end if;
      if not exists(select 1 from public.prizes p where p.id=p_id and
        ((item->>'kind'='unified_weighted_score' and p.judging_style='weighted_score') or
         (item->>'kind'='per_prize' and p.id=(item->>'prizeId')::uuid and p.judging_style in ('gate_check','bucket_sort','judges_pick')))) then raise exception 'Invalid prize coverage'; end if;
      insert into public.judge_assignment_prizes(assignment_id,prize_id) values(a_id,p_id) on conflict do nothing;
    end loop;
    if not exists(select 1 from public.judge_assignment_prizes where assignment_id=a_id) then raise exception 'No prize is assigned to this scorecard'; end if;
    coverage_count := coverage_count+(select count(*) from public.judge_assignment_prizes where assignment_id=a_id);
  end loop;
  result := jsonb_build_object('createdAssignments',n,'createdCoverage',coverage_count,'version',public.get_judging_distribution_snapshot(p_hackathon_id)->>'version','coverage',p_summary->'coverage','warnings',p_summary->'warnings');
  insert into public.judging_distribution_receipts(hackathon_id,request_key,fingerprint,result) values(p_hackathon_id,p_request_key,fingerprint,result);
  return result;
end;
$$;

create or replace function public.judging_has_submitted_reviews(p_hackathon_id uuid, p_round_id uuid, p_all_rounds boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.judge_assignments a where a.hackathon_id=p_hackathon_id and a.is_complete=true and (p_all_rounds or a.round_id is not distinct from p_round_id))
    or exists(select 1 from public.judge_picks jp join public.prizes p on p.id=jp.prize_id where jp.hackathon_id=p_hackathon_id and (p_all_rounds or p.round_id is not distinct from p_round_id));
$$;

create or replace function public.protect_submitted_judging_configuration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare row_data jsonb; previous jsonb; event_id uuid; v_round_id uuid; prize_id uuid; all_rounds boolean := false; changed boolean := true;
begin
  row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous := case when tg_op='UPDATE' then to_jsonb(old) else null end;
  if tg_table_name='prizes' then
    event_id := (row_data->>'hackathon_id')::uuid;
    v_round_id := (row_data->>'round_id')::uuid;
    if row_data->>'judging_style' is null and (previous is null or previous->>'judging_style' is null) then return coalesce(new,old); end if;
    if tg_op='UPDATE' then
      changed := (row_data - array['name','description','value','kind','monetary_value','currency','distribution_method','display_value','display_order','updated_at'])
        is distinct from (previous - array['name','description','value','kind','monetary_value','currency','distribution_method','display_value','display_order','updated_at']);
    end if;
  elsif tg_table_name='judging_rounds' then
    event_id := (row_data->>'hackathon_id')::uuid;
    v_round_id := (row_data->>'id')::uuid;
    if tg_op='INSERT' then return new; end if;
    if tg_op='UPDATE' then
      changed := (row_data - array['name','status','is_active','updated_at','opens_at','closes_at']) is distinct from (previous - array['name','status','is_active','updated_at','opens_at','closes_at']);
    end if;
  elsif tg_table_name='judging_criteria' then
    event_id := (row_data->>'hackathon_id')::uuid;
    prize_id := (row_data->>'prize_id')::uuid;
    if prize_id is null then all_rounds:=true;
    else select p.round_id into v_round_id from public.prizes p where p.id=prize_id; end if;
    if tg_op='UPDATE' then changed := (row_data - array['display_order','updated_at']) is distinct from (previous - array['display_order','updated_at']); end if;
  elsif tg_table_name='bucket_definitions' then
    prize_id := (row_data->>'prize_id')::uuid;
    if prize_id is not null then select p.hackathon_id,p.round_id into event_id,v_round_id from public.prizes p where p.id=prize_id;
    else select r.hackathon_id,r.id into event_id,v_round_id from public.judging_rounds r where r.id=(row_data->>'round_id')::uuid; end if;
    if tg_op='UPDATE' then changed := (row_data - array['display_order','updated_at']) is distinct from (previous - array['display_order','updated_at']); end if;
  elsif tg_table_name='rubric_levels' then
    select c.hackathon_id,c.prize_id into event_id,prize_id from public.judging_criteria c where c.id=(row_data->>'criteria_id')::uuid;
    if prize_id is null then all_rounds:=true; else select p.round_id into v_round_id from public.prizes p where p.id=prize_id; end if;
  elsif tg_table_name='judge_prize_assignments' then
    event_id := (row_data->>'hackathon_id')::uuid;
    select p.round_id into v_round_id from public.prizes p where p.id=(row_data->>'prize_id')::uuid;
    if tg_op='INSERT' then changed := exists(select 1 from public.judge_assignments a where a.hackathon_id=event_id and a.judge_participant_id=(row_data->>'judge_participant_id')::uuid and a.is_complete=true and a.round_id is not distinct from v_round_id); end if;
  elsif tg_table_name='judge_room_assignments' then
    select j.hackathon_id into event_id from public.hackathon_participants j where j.id=(row_data->>'judge_participant_id')::uuid;
    all_rounds:=true;
    changed:=exists(select 1 from public.judge_assignments a where a.judge_participant_id=(row_data->>'judge_participant_id')::uuid and a.is_complete=true)
      or exists(select 1 from public.judge_picks jp where jp.judge_participant_id=(row_data->>'judge_participant_id')::uuid);
  elsif tg_table_name='round_submissions' then
    select r.hackathon_id,r.id into event_id,v_round_id from public.judging_rounds r where r.id=(row_data->>'round_id')::uuid;
  elsif tg_table_name='hackathon_participants' then
    event_id := (row_data->>'hackathon_id')::uuid;
    all_rounds:=true;
    changed := row_data->>'judging_prize_scope' is distinct from previous->>'judging_prize_scope'
      and (exists(select 1 from public.judge_assignments a where a.judge_participant_id=(row_data->>'id')::uuid and a.is_complete=true)
        or exists(select 1 from public.judge_picks jp where jp.judge_participant_id=(row_data->>'id')::uuid));
  elsif tg_table_name='room_teams' then
    select r.hackathon_id into event_id from public.rooms r where r.id=(row_data->>'room_id')::uuid;
    all_rounds:=true;
    changed:=exists(select 1 from public.judge_assignments a join public.submissions s on s.id=a.submission_id where s.team_id=(row_data->>'team_id')::uuid and a.is_complete=true);
  end if;
  if event_id is not null then
    perform 1 from public.hackathons where id=event_id for update;
    if not found then return coalesce(new,old); end if;
    if changed and (public.judging_has_submitted_reviews(event_id,v_round_id,all_rounds)
      or (tg_table_name='prizes' and tg_op='UPDATE' and public.judging_has_submitted_reviews(event_id,(previous->>'round_id')::uuid,false))) then
      raise exception 'judging_rules_locked: Reviews have been submitted. Start a new round to change scoring rules.';
    end if;
    update public.hackathons set updated_at=clock_timestamp() where id=event_id;
  end if;
  return coalesce(new,old);
end;
$$;

create trigger protect_submitted_prizes before insert or update or delete on public.prizes for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_criteria before insert or update or delete on public.judging_criteria for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_buckets before insert or update or delete on public.bucket_definitions for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_levels before insert or update or delete on public.rubric_levels for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_rounds before insert or update or delete on public.judging_rounds for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_panels before insert or update or delete on public.judge_prize_assignments for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_judge_rooms before insert or update or delete on public.judge_room_assignments for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_round_projects before insert or update or delete on public.round_submissions for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_judge_scope before update of judging_prize_scope on public.hackathon_participants for each row execute function public.protect_submitted_judging_configuration();
create trigger protect_submitted_project_rooms before insert or update or delete on public.room_teams for each row execute function public.protect_submitted_judging_configuration();

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
  v_criterion_id uuid;
  v_bucket_id uuid;
  v_kept_criteria uuid[] := '{}';
  v_kept_buckets uuid[] := '{}';
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
    judge_scope = case when p_prize_updates ? 'judge_scope' then p_prize_updates->>'judge_scope' else judge_scope end,
    is_screening = case when p_prize_updates ? 'is_screening' then (p_prize_updates->>'is_screening')::boolean else is_screening end,
    updated_at = now()
  where id = p_prize_id and hackathon_id = p_hackathon_id
  returning * into v_prize;

  if p_criteria is not null then
    v_order := 0;
    for v_criterion in select value from jsonb_array_elements(p_criteria) loop
      v_criterion_id := null;
      if v_criterion->>'id' is not null then
        select id into v_criterion_id from public.judging_criteria where id=(v_criterion->>'id')::uuid and prize_id=p_prize_id;
        if not found then raise exception 'Criterion does not belong to this prize'; end if;
      else
        select id into v_criterion_id from public.judging_criteria where prize_id=p_prize_id and display_order=v_order and not(id=any(v_kept_criteria)) order by id limit 1;
      end if;
      v_criterion_id := coalesce(v_criterion_id,gen_random_uuid());
      if v_criterion_id=any(v_kept_criteria) then raise exception 'Each criterion can appear only once'; end if;
      update public.judging_criteria set name=btrim(v_criterion->>'name'),description=nullif(btrim(coalesce(v_criterion->>'description','')),''),
        min_score=(v_criterion->>'min_score')::integer,max_score=(v_criterion->>'max_score')::integer,weight=(v_criterion->>'weight')::numeric,display_order=v_order
      where id=v_criterion_id and prize_id=p_prize_id;
      if not found then
        insert into public.judging_criteria(id,hackathon_id,prize_id,name,description,min_score,max_score,weight,display_order)
        values(v_criterion_id,p_hackathon_id,p_prize_id,btrim(v_criterion->>'name'),nullif(btrim(coalesce(v_criterion->>'description','')),''),(v_criterion->>'min_score')::integer,(v_criterion->>'max_score')::integer,(v_criterion->>'weight')::numeric,v_order);
      end if;
      v_kept_criteria := array_append(v_kept_criteria,v_criterion_id);
      v_order := v_order+1;
    end loop;
    delete from public.judging_criteria where prize_id=p_prize_id and not(id=any(v_kept_criteria));
  end if;
  if p_buckets is not null then
    v_order := 0;
    for v_bucket in select value from jsonb_array_elements(p_buckets) loop
      v_bucket_id := null;
      select id into v_bucket_id from public.bucket_definitions where prize_id=p_prize_id and level=(v_bucket->>'level')::integer order by id limit 1;
      v_bucket_id := coalesce(v_bucket_id,gen_random_uuid());
      if v_bucket_id=any(v_kept_buckets) then raise exception 'Each sort group can appear only once'; end if;
      update public.bucket_definitions set level=(v_bucket->>'level')::integer,label=btrim(v_bucket->>'label'),description=nullif(btrim(coalesce(v_bucket->>'description','')),''),display_order=v_order
      where id=v_bucket_id and prize_id=p_prize_id;
      if not found then
        insert into public.bucket_definitions(id,prize_id,level,label,description,display_order)
        values(v_bucket_id,p_prize_id,(v_bucket->>'level')::integer,btrim(v_bucket->>'label'),nullif(btrim(coalesce(v_bucket->>'description','')),''),v_order);
      end if;
      v_kept_buckets := array_append(v_kept_buckets,v_bucket_id);
      v_order := v_order+1;
    end loop;
    delete from public.bucket_definitions where prize_id=p_prize_id and not(id=any(v_kept_buckets));
  end if;

  return to_jsonb(v_prize);
end;
$$;


revoke all on function public.judging_prize_assignment_eligible(uuid,uuid) from public,anon,authenticated;
revoke all on function public.attach_judging_assignment_prizes() from public,anon,authenticated;
revoke all on function public.get_judging_assignment_scope(uuid,uuid) from public,anon,authenticated;
revoke all on function public.assert_judging_assignment_scope(uuid,text) from public,anon,authenticated;
revoke all on function public.get_judging_distribution_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.apply_judging_distribution(uuid,text,text,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.judging_has_submitted_reviews(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.protect_submitted_judging_configuration() from public,anon,authenticated;
grant execute on function public.judging_prize_assignment_eligible(uuid,uuid) to service_role;
grant execute on function public.attach_judging_assignment_prizes() to service_role;
grant execute on function public.get_judging_assignment_scope(uuid,uuid) to service_role;
grant execute on function public.assert_judging_assignment_scope(uuid,text) to service_role;
grant execute on function public.get_judging_distribution_snapshot(uuid) to service_role;
grant execute on function public.apply_judging_distribution(uuid,text,text,integer,jsonb,jsonb) to service_role;
grant execute on function public.judging_has_submitted_reviews(uuid,uuid,boolean) to service_role;
grant execute on function public.protect_submitted_judging_configuration() to service_role;

create or replace function public.get_judging_distribution_receipt(p_hackathon_id uuid,p_request_key text,p_expected_version text,p_target integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare receipt public.judging_distribution_receipts%rowtype;
begin
  select * into receipt from public.judging_distribution_receipts where hackathon_id=p_hackathon_id and request_key=p_request_key;
  if not found then return null; end if;
  if receipt.fingerprint <> md5(jsonb_build_object('version',p_expected_version,'target',p_target)::text) then raise exception 'This request key was already used for another plan'; end if;
  return receipt.result;
end;
$$;

create or replace function public.get_eligible_weighted_assignment_ids(p_hackathon_id uuid,p_prize_id uuid default null)
returns uuid[] language sql stable security invoker set search_path='' as $$
  select coalesce(array_agg(distinct eligible.id),'{}') from (
  select a.id from public.judge_assignments a
  join public.judge_assignment_prizes ap on ap.assignment_id=a.id
  join public.prizes p on p.id=ap.prize_id
  where a.hackathon_id=p_hackathon_id and a.scoring_scope='scoped' and a.assignment_kind='unified_weighted_score' and a.is_complete=true
    and p.judging_style='weighted_score'
    and ((p_prize_id is not null and p.id=p_prize_id) or (p_prize_id is null and p.type='score' and p.rank is not null))
    and public.judging_prize_assignment_eligible(a.id,p.id)
    and not exists (
      select 1 from public.judging_criteria c
      where c.hackathon_id=a.hackathon_id and (c.prize_id is null or (p_prize_id is not null and c.prize_id=p.id))
        and not exists(select 1 from public.scores sc where sc.judge_assignment_id=a.id and sc.criteria_id=c.id)
    )
  union
  select a.id from public.judge_assignments a
  where a.hackathon_id=p_hackathon_id and a.scoring_scope='legacy_unscoped' and a.assignment_kind='unified_weighted_score' and a.is_complete=true
    and (p_prize_id is null or exists(select 1 from public.judge_assignment_prizes ap where ap.assignment_id=a.id and ap.prize_id=p_prize_id))
  ) eligible;
$$;
revoke all on function public.get_judging_distribution_receipt(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.get_judging_distribution_receipt(uuid,text,text,integer) to service_role;
revoke all on function public.get_eligible_weighted_assignment_ids(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_eligible_weighted_assignment_ids(uuid,uuid) to service_role;

create or replace function public.set_judge_prize_scope_membership(p_hackathon_id uuid,p_prize_id uuid,p_judge_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.hackathons where id=p_hackathon_id for update;
  if not exists(select 1 from public.hackathon_participants where id=p_judge_id and hackathon_id=p_hackathon_id and role='judge') then raise exception 'Judge not found'; end if;
  if not exists(select 1 from public.prizes where id=p_prize_id and hackathon_id=p_hackathon_id) then raise exception 'Prize not found'; end if;
  update public.hackathon_participants set judging_prize_scope='selected' where id=p_judge_id and hackathon_id=p_hackathon_id;
  if not exists(select 1 from public.judge_prize_assignments where prize_id=p_prize_id and judge_participant_id=p_judge_id) then
    insert into public.judge_prize_assignments(hackathon_id,prize_id,judge_participant_id) values(p_hackathon_id,p_prize_id,p_judge_id);
  end if;
end;
$$;
revoke all on function public.set_judge_prize_scope_membership(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_judge_prize_scope_membership(uuid,uuid,uuid) to service_role;


create or replace function public.save_judging_judge_scope(
  p_hackathon_id uuid, p_judge_id uuid, p_expected_version text,
  p_prize_scope text, p_prize_ids uuid[], p_room_ids uuid[]
) returns void language plpgsql security invoker set search_path='' as $$
declare h public.hackathons%rowtype; desired_prizes uuid[];
begin
  select * into h from public.hackathons where id=p_hackathon_id for update;
  if not found then raise exception 'Event not found'; end if;
  if h.status::text in ('completed','archived') or h.results_published_at is not null then raise exception 'Judging assignments are closed'; end if;
  if not exists(select 1 from public.hackathon_participants where id=p_judge_id and hackathon_id=p_hackathon_id and role='judge' and judging_scope_ready) then raise exception 'Judge setup is still pending'; end if;
  if p_expected_version is distinct from (public.get_judging_distribution_snapshot(p_hackathon_id)->>'version') then raise exception 'Judging changed. Reload this judge before saving.'; end if;
  if p_prize_scope is null or p_prize_scope not in ('all','selected') or p_prize_ids is null or p_room_ids is null
    or cardinality(p_prize_ids)>100 or cardinality(p_room_ids)>100 or (p_prize_scope='selected' and cardinality(p_prize_ids)=0) then raise exception 'Choose the prizes and rooms this judge can review'; end if;
  if exists(select 1 from unnest(p_prize_ids) v(id) where not exists(select 1 from public.prizes p where p.id=v.id and p.hackathon_id=p_hackathon_id and p.judging_style is distinct from 'crowd_vote'))
    or exists(select 1 from unnest(p_room_ids) v(id) where not exists(select 1 from public.rooms r where r.id=v.id and r.hackathon_id=p_hackathon_id)) then raise exception 'Choose prizes and rooms from this event'; end if;
  if exists(select 1 from public.judge_assignments where judge_participant_id=p_judge_id and is_complete=true)
    or exists(select 1 from public.judge_picks where judge_participant_id=p_judge_id) then raise exception 'This judge has submitted reviews. Their prizes and rooms must stay fixed.'; end if;
  if p_prize_scope='all' then select coalesce(array_agg(id),'{}') into desired_prizes from public.prizes where hackathon_id=p_hackathon_id and judging_style is distinct from 'crowd_vote'; else desired_prizes:=p_prize_ids; end if;
  update public.hackathon_participants set judging_prize_scope=p_prize_scope where id=p_judge_id;
  delete from public.judge_prize_assignments where judge_participant_id=p_judge_id and not(prize_id=any(desired_prizes));
  insert into public.judge_prize_assignments(hackathon_id,judge_participant_id,prize_id)
    select p_hackathon_id,p_judge_id,v.id from (select distinct unnest(desired_prizes) id) v
    where not exists(select 1 from public.judge_prize_assignments jp where jp.judge_participant_id=p_judge_id and jp.prize_id=v.id);
  delete from public.judge_room_assignments where judge_participant_id=p_judge_id and not(room_id=any(p_room_ids));
  insert into public.judge_room_assignments(hackathon_id,room_id,judge_participant_id)
    select p_hackathon_id,v.id,p_judge_id from (select distinct unnest(p_room_ids) id) v
    where not exists(select 1 from public.judge_room_assignments jr where jr.judge_participant_id=p_judge_id and jr.room_id=v.id);
  update public.hackathons set updated_at=clock_timestamp() where id=p_hackathon_id;
end;
$$;
revoke all on function public.save_judging_judge_scope(uuid,uuid,text,text,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.save_judging_judge_scope(uuid,uuid,text,text,uuid[],uuid[]) to service_role;

create or replace function public.get_judging_visible_assignment_ids(p_hackathon_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(a.id),'[]'::jsonb) from public.judge_assignments a
  where a.hackathon_id=p_hackathon_id and (
    a.is_complete=true or a.scoring_scope='legacy_unscoped'
    or (a.assignment_kind='unified_weighted_score' and exists(select 1 from public.judge_assignment_prizes ap where ap.assignment_id=a.id and public.judging_prize_assignment_eligible(a.id,ap.prize_id)))
    or (a.assignment_kind='per_prize' and public.judging_prize_assignment_eligible(a.id,a.prize_id))
  );
$$;
revoke all on function public.get_judging_visible_assignment_ids(uuid) from public,anon,authenticated;
grant execute on function public.get_judging_visible_assignment_ids(uuid) to service_role;
