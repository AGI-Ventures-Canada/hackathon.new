create or replace function public.get_scheduled_judging_readiness(p_hackathon_id uuid, p_round_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  selected_round uuid; prize public.prizes%rowtype; issues text[]:='{}'; missing_projects uuid[]:='{}';
  missing_for_prize uuid[]; category_count integer; invalid_count integer; total_weight numeric;
  prize_count integer:=0; requires_judges boolean:=false; reviewed_legacy_card boolean;
begin
  if not exists(select 1 from public.hackathons where id=p_hackathon_id) then
    return jsonb_build_object('isReady',false,'issues',array['Event not found.'],'unassignedProjectCount',0,'requiresJudgeScoring',false);
  end if;
  selected_round:=p_round_id;
  if selected_round is null then
    select id into selected_round from public.judging_rounds where hackathon_id=p_hackathon_id and status='active' order by display_order,id limit 1;
  elsif not exists(select 1 from public.judging_rounds where id=selected_round and hackathon_id=p_hackathon_id and status='active') then
    issues:=array_append(issues,'This judging round is not open.');
  end if;
  if selected_round is not null and not exists(select 1 from public.round_submissions where round_id=selected_round)
    and exists(select 1 from public.judging_rounds earlier join public.judging_rounds current_round on current_round.id=selected_round
      where earlier.hackathon_id=p_hackathon_id and earlier.display_order<current_round.display_order and earlier.status in ('complete','advanced')) then
    issues:=array_append(issues,'Choose which projects move into this round before judging opens.');
  end if;
  if not exists(select 1 from public.submissions where hackathon_id=p_hackathon_id and status='submitted') then
    issues:=array_append(issues,'No projects are ready to score.');
  end if;
  for prize in select p.* from public.prizes p where p.hackathon_id=p_hackathon_id and p.judging_style is not null
    and (p.round_id is null or p.round_id=selected_round) order by p.id loop
    prize_count:=prize_count+1;
    requires_judges:=requires_judges or prize.judging_style<>'crowd_vote';
    if prize.judging_style='weighted_score' then
      select count(*),count(*) filter(where c.weight<=0 or c.min_score>=c.max_score or btrim(c.name)=''),coalesce(sum(c.weight),0)
      into category_count,invalid_count,total_weight from public.judging_criteria c
      where c.hackathon_id=p_hackathon_id and (c.prize_id is null or c.prize_id=prize.id);
      select exists(select 1 from public.judge_assignments a where a.hackathon_id=p_hackathon_id
        and a.scoring_scope='legacy_unscoped' and a.is_complete
        and exists(select 1 from public.scores sc where sc.judge_assignment_id=a.id)
        and (a.prize_id=prize.id or exists(select 1 from public.judge_assignment_prizes ap where ap.assignment_id=a.id and ap.prize_id=prize.id)))
        into reviewed_legacy_card;
      if category_count=0 then issues:=array_append(issues,'Add score categories for '||prize.name||'.');
      elsif invalid_count>0 or (abs(total_weight-100)>0.01 and not reviewed_legacy_card) then issues:=array_append(issues,'Finish the scorecard for '||prize.name||'.'); end if;
    elsif prize.judging_style='gate_check' and not exists(select 1 from public.judging_criteria c where c.prize_id=prize.id and btrim(c.name)<>'') then
      issues:=array_append(issues,'Add at least one check for '||prize.name||'.');
    elsif prize.judging_style='bucket_sort' and (select count(*) from public.bucket_definitions b where b.prize_id=prize.id and btrim(b.label)<>'')<2 then
      issues:=array_append(issues,'Add at least two sort groups for '||prize.name||'.');
    elsif prize.judging_style='judges_pick' and (prize.max_picks is null or prize.max_picks not between 1 and 100) then
      issues:=array_append(issues,'Set how many projects judges can pick for '||prize.name||'.');
    end if;
    if prize.judging_style='crowd_vote' then continue; end if;
    select coalesce(array_agg(s.id),'{}') into missing_for_prize
    from public.submissions s left join public.teams t on t.id=s.team_id
    where s.hackathon_id=p_hackathon_id and s.status='submitted'
      and (coalesce(cardinality(prize.allowed_team_modes),0)=0 or t.mode=any(prize.allowed_team_modes))
      and (coalesce(prize.round_id,selected_round) is null or not exists(select 1 from public.round_submissions rs where rs.round_id=coalesce(prize.round_id,selected_round))
        or exists(select 1 from public.round_submissions rs where rs.round_id=coalesce(prize.round_id,selected_round) and rs.submission_id=s.id))
      and not exists(select 1 from public.judge_assignments a
        where a.hackathon_id=p_hackathon_id and a.submission_id=s.id and a.round_id is not distinct from prize.round_id
          and ((prize.judging_style='weighted_score' and a.assignment_kind='unified_weighted_score'
              and exists(select 1 from public.judge_assignment_prizes ap where ap.assignment_id=a.id and ap.prize_id=prize.id))
            or (prize.judging_style='weighted_score' and a.scoring_scope='legacy_unscoped' and a.assignment_kind='per_prize' and a.prize_id=prize.id)
            or (prize.judging_style<>'weighted_score' and a.assignment_kind='per_prize' and a.prize_id=prize.id))
          and public.judging_prize_assignment_eligible(a.id,prize.id));
    if cardinality(missing_for_prize)>0 then
      missing_projects:=missing_projects||missing_for_prize;
      issues:=array_append(issues,'Assign eligible judges to every project for '||prize.name||'.');
    end if;
  end loop;
  if prize_count=0 then issues:=array_append(issues,'Pick how judges should score at least one prize.'); end if;
  return jsonb_build_object('isReady',cardinality(issues)=0,'issues',to_jsonb(issues),
    'unassignedProjectCount',(select count(distinct id) from unnest(missing_projects) ids(id)),'requiresJudgeScoring',requires_judges);
end;
$$;
revoke all on function public.get_scheduled_judging_readiness(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_scheduled_judging_readiness(uuid,uuid) to service_role;

create or replace function public.judging_window_is_open(p_hackathon_id uuid,p_round_id uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(case
    when public.effective_hackathon_status(h.status,h.starts_at,h.ends_at)::text not in ('active','judging') or h.results_published_at is not null then false
    when p_round_id is not null and (r.id is null or r.status::text<>'active') then false
    when coalesce(r.opens_at,h.judging_opens_at) is null and coalesce(r.closes_at,h.judging_closes_at) is null then
      public.effective_hackathon_status(h.status,h.starts_at,h.ends_at)::text='judging'
      or coalesce(h.phase::text in ('preliminaries','finals'),false) or coalesce(r.status::text='active',false)
    else now()>=coalesce(r.opens_at,h.judging_opens_at) and now()<coalesce(r.closes_at,h.judging_closes_at)
      and (public.get_scheduled_judging_readiness(h.id,p_round_id)->>'isReady')::boolean
  end,false)
  from public.hackathons h left join public.judging_rounds r on r.id=coalesce(p_round_id,
    (select active_round.id from public.judging_rounds active_round where active_round.hackathon_id=h.id and active_round.status='active' order by active_round.display_order,active_round.id limit 1))
    and r.hackathon_id=h.id where h.id=p_hackathon_id;
$$;
revoke all on function public.judging_window_is_open(uuid,uuid) from public,anon,authenticated;
grant execute on function public.judging_window_is_open(uuid,uuid) to service_role;

create or replace function public.assert_judging_assignment_scope(p_assignment_id uuid,p_expected_criteria_version text)
returns void language plpgsql security invoker set search_path='' as $$
declare assignment public.judge_assignments%rowtype; scope jsonb; active_round uuid;
begin
  select * into assignment from public.judge_assignments where id=p_assignment_id;
  if not found then raise exception 'Assignment not found'; end if;
  perform 1 from public.hackathons where id=assignment.hackathon_id for update;
  perform 1 from public.judge_assignments where id=assignment.id for update;
  if assignment.round_id is null then
    select id into active_round from public.judging_rounds where hackathon_id=assignment.hackathon_id and status='active' order by display_order,id limit 1;
    if active_round is not null and exists(select 1 from public.round_submissions where round_id=active_round)
      and not exists(select 1 from public.round_submissions where round_id=active_round and submission_id=assignment.submission_id) then
      raise exception 'round_not_active: This project is not in the active judging round';
    end if;
  end if;
  scope:=public.get_judging_assignment_scope(assignment.id,assignment.hackathon_id);
  if scope->>'criteriaVersion' is distinct from p_expected_criteria_version then
    raise exception 'scorecard_changed: Review the updated scorecard before submitting';
  end if;
end;
$$;
revoke all on function public.assert_judging_assignment_scope(uuid,text) from public,anon,authenticated;
grant execute on function public.assert_judging_assignment_scope(uuid,text) to service_role;

create or replace function public.judging_assignment_in_active_pool(p_assignment_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.judge_assignments a
    left join lateral (select coalesce(a.round_id,(select r.id from public.judging_rounds r where r.hackathon_id=a.hackathon_id and r.status='active' order by r.display_order,r.id limit 1)) id) pool on true
    where a.id=p_assignment_id and (pool.id is null or not exists(select 1 from public.round_submissions rs where rs.round_id=pool.id)
      or exists(select 1 from public.round_submissions rs where rs.round_id=pool.id and rs.submission_id=a.submission_id)));
$$;
revoke all on function public.judging_assignment_in_active_pool(uuid) from public,anon,authenticated;
grant execute on function public.judging_assignment_in_active_pool(uuid) to service_role;

create or replace function public.judging_submission_in_active_pool(p_hackathon_id uuid,p_submission_id uuid,p_round_id uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.submissions s
    left join lateral (select coalesce(p_round_id,(select r.id from public.judging_rounds r where r.hackathon_id=p_hackathon_id and r.status='active' order by r.display_order,r.id limit 1)) id) pool on true
    where s.id=p_submission_id and s.hackathon_id=p_hackathon_id
      and (pool.id is null or not exists(select 1 from public.round_submissions rs where rs.round_id=pool.id)
        or exists(select 1 from public.round_submissions rs where rs.round_id=pool.id and rs.submission_id=s.id)));
$$;
revoke all on function public.judging_submission_in_active_pool(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.judging_submission_in_active_pool(uuid,uuid,uuid) to service_role;

create or replace function public.judging_pick_review_version(p_prize_id uuid,p_judge_id uuid)
returns text language sql stable security invoker set search_path='' as $$
  select md5(jsonb_build_object('prize',p.id,'maxPicks',p.max_picks,'round',coalesce(p.round_id,
    (select r.id from public.judging_rounds r where r.hackathon_id=p.hackathon_id and r.status='active' order by r.display_order,r.id limit 1)),
    'projects',coalesce((select jsonb_agg(a.submission_id order by a.submission_id) from public.judge_assignments a
      where a.prize_id=p.id and a.judge_participant_id=p_judge_id and public.judging_assignment_in_active_pool(a.id)),'[]'::jsonb))::text)
  from public.prizes p where p.id=p_prize_id and p.judging_style='judges_pick';
$$;
revoke all on function public.judging_pick_review_version(uuid,uuid) from public,anon,authenticated;
grant execute on function public.judging_pick_review_version(uuid,uuid) to service_role;

create or replace function public.judging_window_is_configured(p_hackathon_id uuid,p_round_id uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(h.judging_opens_at is not null or r.opens_at is not null,false)
  from public.hackathons h left join public.judging_rounds r on r.id=coalesce(p_round_id,
    (select active_round.id from public.judging_rounds active_round where active_round.hackathon_id=h.id and active_round.status='active' order by active_round.display_order,active_round.id limit 1))
    and r.hackathon_id=h.id where h.id=p_hackathon_id;
$$;
revoke all on function public.judging_window_is_configured(uuid,uuid) from public,anon,authenticated;
grant execute on function public.judging_window_is_configured(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.save_judging_review_atomic(
  p_hackathon_id uuid, p_judge_id uuid, p_clerk_user_id text,
  p_assignment_id uuid, p_prize_id uuid, p_expected_revision bigint,
  p_criteria_version text, p_response jsonb, p_publish boolean DEFAULT false
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_assignment public.judge_assignments%rowtype;
  v_review public.judging_review_drafts%rowtype;
  v_round_id uuid;
  v_scope jsonb;
  v_criterion jsonb;
  v_score jsonb;
  v_entry record;
  v_kind text;
  v_expected_kind text;
  v_max_picks integer;
  v_count integer;
  v_judge_team_id uuid;
BEGIN
  IF (p_assignment_id IS NULL) = (p_prize_id IS NULL) THEN RAISE EXCEPTION 'invalid_review_target'; END IF;
  PERFORM 1 FROM public.hackathons WHERE id = p_hackathon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  SELECT team_id INTO v_judge_team_id FROM public.hackathon_participants WHERE id = p_judge_id AND hackathon_id = p_hackathon_id AND clerk_user_id = p_clerk_user_id AND role = 'judge' AND judging_scope_ready;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  IF jsonb_typeof(p_response) IS DISTINCT FROM 'object' OR jsonb_typeof(p_response->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_response->'notes') IS DISTINCT FROM 'string' OR p_expected_revision IS NULL OR p_expected_revision < 0 OR p_criteria_version IS NULL OR p_publish IS NULL OR length(p_response->>'notes') > 2000 THEN RAISE EXCEPTION 'invalid_response'; END IF;
  v_kind := p_response->>'kind';
  IF p_assignment_id IS NOT NULL THEN
    SELECT * INTO v_assignment FROM public.judge_assignments WHERE id = p_assignment_id AND hackathon_id = p_hackathon_id AND judge_participant_id = p_judge_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
    IF v_judge_team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.submissions WHERE id = v_assignment.submission_id AND team_id = v_judge_team_id) THEN RAISE EXCEPTION 'self_judging'; END IF;
    v_round_id := v_assignment.round_id;
    SELECT judging_style INTO v_expected_kind FROM public.prizes WHERE id = v_assignment.prize_id;
    v_expected_kind := COALESCE(v_expected_kind,'weighted_score');
    IF v_kind IS DISTINCT FROM v_expected_kind OR v_kind = 'judges_pick' THEN RAISE EXCEPTION 'invalid_response_kind'; END IF;
    PERFORM public.assert_judging_assignment_scope(p_assignment_id,p_criteria_version);
    v_scope := public.get_judging_assignment_scope(p_assignment_id,p_hackathon_id);
    IF v_kind = 'weighted_score' THEN
      IF jsonb_typeof(p_response->'scores') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_scores'; END IF;
      FOR v_entry IN SELECT * FROM jsonb_each(p_response->'scores') LOOP
        SELECT value INTO v_criterion FROM jsonb_array_elements(v_scope->'criteria') WHERE value->>'id' = v_entry.key;
        IF NOT FOUND THEN RAISE EXCEPTION 'invalid_criterion'; END IF;
        IF v_entry.value <> 'null'::jsonb AND (jsonb_typeof(v_entry.value) <> 'number' OR (v_entry.value::text)::numeric < (v_criterion->>'min_score')::numeric OR (v_entry.value::text)::numeric > (v_criterion->>'max_score')::numeric OR trunc((v_entry.value::text)::numeric) <> (v_entry.value::text)::numeric) THEN RAISE EXCEPTION 'invalid_score'; END IF;
      END LOOP;
      IF p_publish THEN
        IF jsonb_array_length(v_scope->'criteria') = 0 THEN RAISE EXCEPTION 'criteria_missing'; END IF;
        FOR v_criterion IN SELECT value FROM jsonb_array_elements(v_scope->'criteria') LOOP
          v_score := p_response->'scores'->(v_criterion->>'id');
          IF v_score IS NULL OR v_score = 'null'::jsonb THEN RAISE EXCEPTION 'incomplete_review'; END IF;
          IF EXISTS (SELECT 1 FROM public.rubric_levels WHERE criteria_id = (v_criterion->>'id')::uuid) AND NOT EXISTS (SELECT 1 FROM public.rubric_levels WHERE criteria_id = (v_criterion->>'id')::uuid AND level_number = (v_score::text)::integer) THEN RAISE EXCEPTION 'invalid_rating'; END IF;
        END LOOP;
      END IF;
    ELSIF v_kind = 'gate_check' THEN
      IF jsonb_typeof(p_response->'gates') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_checks'; END IF;
      FOR v_entry IN SELECT * FROM jsonb_each(p_response->'gates') LOOP
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope->'criteria') WHERE value->>'id' = v_entry.key) OR (v_entry.value <> 'null'::jsonb AND jsonb_typeof(v_entry.value) <> 'boolean') THEN RAISE EXCEPTION 'invalid_check'; END IF;
      END LOOP;
      IF p_publish THEN
        IF jsonb_array_length(v_scope->'criteria') = 0 THEN RAISE EXCEPTION 'criteria_missing'; END IF;
        FOR v_criterion IN SELECT value FROM jsonb_array_elements(v_scope->'criteria') LOOP
          IF p_response->'gates'->(v_criterion->>'id') IS NULL OR p_response->'gates'->(v_criterion->>'id') = 'null'::jsonb THEN RAISE EXCEPTION 'incomplete_review'; END IF;
        END LOOP;
      END IF;
    ELSIF v_kind = 'bucket_sort' THEN
      IF p_publish AND jsonb_array_length(v_scope->'criteria') > 0 AND NOT (p_response ? 'gates') THEN RAISE EXCEPTION 'incomplete_review'; END IF;
      IF p_response ? 'gates' THEN
        IF jsonb_typeof(p_response->'gates') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_checks'; END IF;
        FOR v_entry IN SELECT * FROM jsonb_each(p_response->'gates') LOOP
          IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope->'criteria') WHERE value->>'id' = v_entry.key) OR (v_entry.value <> 'null'::jsonb AND jsonb_typeof(v_entry.value) <> 'boolean') THEN RAISE EXCEPTION 'invalid_check'; END IF;
        END LOOP;
        IF p_publish AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope->'criteria') WHERE p_response->'gates'->(value->>'id') IS NULL OR p_response->'gates'->(value->>'id') = 'null'::jsonb) THEN RAISE EXCEPTION 'incomplete_review'; END IF;
      END IF;
      IF p_response->>'bucketId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bucket_definitions WHERE id = (p_response->>'bucketId')::uuid AND prize_id = v_assignment.prize_id) THEN RAISE EXCEPTION 'invalid_bucket'; END IF;
      IF p_publish AND p_response->>'bucketId' IS NULL THEN RAISE EXCEPTION 'incomplete_review'; END IF;
    END IF;
  ELSE
    SELECT round_id,greatest(1,COALESCE(max_picks,1)) INTO v_round_id,v_max_picks FROM public.prizes WHERE id = p_prize_id AND hackathon_id = p_hackathon_id AND judging_style = 'judges_pick' FOR UPDATE;
    IF NOT FOUND OR v_kind IS DISTINCT FROM 'judges_pick' THEN RAISE EXCEPTION 'review_not_found'; END IF;
    IF p_criteria_version IS DISTINCT FROM public.judging_pick_review_version(p_prize_id,p_judge_id) THEN RAISE EXCEPTION 'review_changed'; END IF;
    IF jsonb_typeof(p_response->'rankedSubmissionIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_picks'; END IF;
    v_count := jsonb_array_length(p_response->'rankedSubmissionIds');
    IF v_count > v_max_picks OR (p_publish AND v_count = 0) OR v_count <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_response->'rankedSubmissionIds')) THEN RAISE EXCEPTION 'invalid_picks'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.judge_assignments WHERE prize_id = p_prize_id AND judge_participant_id = p_judge_id AND hackathon_id = p_hackathon_id AND public.judging_assignment_in_active_pool(id)) THEN RAISE EXCEPTION 'review_not_found'; END IF;
    FOR v_entry IN SELECT value FROM jsonb_array_elements_text(p_response->'rankedSubmissionIds') LOOP
      IF NOT EXISTS (SELECT 1 FROM public.judge_assignments a JOIN public.submissions s ON s.id = a.submission_id WHERE a.prize_id = p_prize_id AND a.judge_participant_id = p_judge_id AND a.hackathon_id = p_hackathon_id AND a.submission_id = v_entry.value::uuid AND public.judging_assignment_in_active_pool(a.id) AND (v_judge_team_id IS NULL OR s.team_id IS DISTINCT FROM v_judge_team_id)) THEN RAISE EXCEPTION 'project_not_assigned'; END IF;
    END LOOP;
  END IF;
  IF NOT public.judging_window_is_open(p_hackathon_id,v_round_id) THEN RAISE EXCEPTION 'judging_closed'; END IF;
  IF v_round_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.judging_rounds WHERE id = v_round_id AND status = 'active') THEN RAISE EXCEPTION 'round_not_active'; END IF;
  INSERT INTO public.judging_review_drafts(hackathon_id,judge_participant_id,assignment_id,prize_id,criteria_version) VALUES(p_hackathon_id,p_judge_id,p_assignment_id,p_prize_id,p_criteria_version) ON CONFLICT DO NOTHING;
  SELECT * INTO v_review FROM public.judging_review_drafts WHERE judge_participant_id = p_judge_id AND ((p_assignment_id IS NOT NULL AND assignment_id = p_assignment_id) OR (p_prize_id IS NOT NULL AND prize_id = p_prize_id)) FOR UPDATE;
  IF v_review.revision <> p_expected_revision THEN RAISE EXCEPTION 'review_changed'; END IF;
  IF p_publish THEN
    PERFORM set_config('app.judging_review_write','on',true);
    IF v_kind = 'weighted_score' THEN
      INSERT INTO public.scores(judge_assignment_id,criteria_id,score,updated_at) SELECT p_assignment_id,key::uuid,(value::text)::integer,now() FROM jsonb_each(p_response->'scores') ON CONFLICT(judge_assignment_id,criteria_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();
    ELSIF v_kind = 'gate_check' THEN
      INSERT INTO public.binary_responses(judge_assignment_id,criteria_id,passed,updated_at) SELECT p_assignment_id,key::uuid,(value::text)::boolean,now() FROM jsonb_each(p_response->'gates') ON CONFLICT(judge_assignment_id,criteria_id) DO UPDATE SET passed = EXCLUDED.passed,updated_at = now();
    ELSIF v_kind = 'bucket_sort' THEN
      IF p_response ? 'gates' THEN INSERT INTO public.binary_responses(judge_assignment_id,criteria_id,passed,updated_at) SELECT p_assignment_id,key::uuid,(value::text)::boolean,now() FROM jsonb_each(p_response->'gates') ON CONFLICT(judge_assignment_id,criteria_id) DO UPDATE SET passed = EXCLUDED.passed,updated_at = now(); END IF;
      INSERT INTO public.bucket_responses(judge_assignment_id,bucket_id,notes,updated_at) VALUES(p_assignment_id,(p_response->>'bucketId')::uuid,p_response->>'notes',now()) ON CONFLICT(judge_assignment_id) DO UPDATE SET bucket_id = EXCLUDED.bucket_id,notes = EXCLUDED.notes,updated_at = now();
    ELSE
      DELETE FROM public.judge_picks WHERE prize_id = p_prize_id AND judge_participant_id = p_judge_id;
      INSERT INTO public.judge_picks(hackathon_id,judge_participant_id,prize_id,submission_id,rank,reason) SELECT p_hackathon_id,p_judge_id,p_prize_id,value::uuid,ordinality::integer,NULLIF(p_response->>'notes','') FROM jsonb_array_elements_text(p_response->'rankedSubmissionIds') WITH ORDINALITY;
      UPDATE public.judge_assignments SET is_complete = true,completed_at = now() WHERE prize_id = p_prize_id AND judge_participant_id = p_judge_id AND hackathon_id = p_hackathon_id AND public.judging_assignment_in_active_pool(id);
    END IF;
    IF p_assignment_id IS NOT NULL THEN UPDATE public.judge_assignments SET is_complete = true,completed_at = now(),notes = COALESCE(p_response->>'notes','') WHERE id = p_assignment_id; END IF;
  END IF;
  UPDATE public.judging_review_drafts SET response = CASE WHEN p_publish THEN NULL ELSE p_response END,revision = v_review.revision + 1,criteria_version = p_criteria_version,submitted_at = CASE WHEN p_publish THEN now() ELSE submitted_at END,updated_at = now() WHERE id = v_review.id;
  PERFORM set_config('app.judging_review_write','off',true);
  RETURN v_review.revision + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_judging_review_atomic(uuid,uuid,text,uuid,uuid,bigint,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_judging_review_atomic(uuid,uuid,text,uuid,uuid,bigint,text,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_judging_window()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row jsonb; v_hackathon_id uuid; v_round_id uuid;
BEGIN
  v_row := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME='judge_picks' THEN
    v_hackathon_id := (v_row->>'hackathon_id')::uuid;
    SELECT round_id INTO v_round_id FROM public.prizes WHERE id=(v_row->>'prize_id')::uuid;
  ELSE
    SELECT hackathon_id,round_id INTO v_hackathon_id,v_round_id FROM public.judge_assignments WHERE id=(v_row->>'judge_assignment_id')::uuid;
  END IF;
  IF v_hackathon_id IS NOT NULL AND public.judging_window_is_configured(v_hackathon_id,v_round_id)
    AND NOT public.judging_window_is_open(v_hackathon_id,v_round_id) THEN
    RAISE EXCEPTION 'Judging is not open for scores' USING ERRCODE='23514';
  END IF;
  IF v_hackathon_id IS NOT NULL AND public.judging_window_is_configured(v_hackathon_id,v_round_id) THEN
    IF TG_TABLE_NAME='judge_picks' THEN
      IF NOT public.judging_submission_in_active_pool(v_hackathon_id,(v_row->>'submission_id')::uuid,v_round_id) THEN
        RAISE EXCEPTION 'round_not_active: This project is not in the active judging round';
      END IF;
    ELSIF NOT public.judging_assignment_in_active_pool((v_row->>'judge_assignment_id')::uuid) THEN
      RAISE EXCEPTION 'round_not_active: This project is not in the active judging round';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

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
  select * into v_hackathon from public.hackathons where id = p_hackathon_id for update;
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
  if public.judging_window_is_configured(p_hackathon_id,(select round_id from public.prizes where id=p_prize_id))
    and not public.judging_window_is_open(p_hackathon_id,(select round_id from public.prizes where id=p_prize_id)) then
    return 'voting_closed';
  end if;
  if not exists (
    select 1 from public.submissions submission
    join public.prizes prize
      on prize.id = p_prize_id and prize.hackathon_id = p_hackathon_id
    left join public.teams team on team.id = submission.team_id
    where submission.id = p_submission_id and submission.hackathon_id = p_hackathon_id
      and submission.status = 'submitted'
      and public.judging_submission_in_active_pool(p_hackathon_id,submission.id,prize.round_id)
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
  select * into v_hackathon from public.hackathons where id = p_hackathon_id for update;
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
  if public.judging_window_is_configured(p_hackathon_id,(select round_id from public.prizes where id=p_prize_id))
    and not public.judging_window_is_open(p_hackathon_id,(select round_id from public.prizes where id=p_prize_id)) then
    return 'voting_closed';
  end if;

  delete from public.crowd_votes
  where hackathon_id = p_hackathon_id and prize_id = p_prize_id and clerk_user_id = p_clerk_user_id;
  return 'success';
end;
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
  if public.judging_window_is_configured(p_hackathon_id,(select round_id from public.prizes where id=p_prize_id))
    and not public.judging_window_is_open(p_hackathon_id,(select round_id from public.prizes where id=p_prize_id)) then
    raise exception 'Judging is closed';
  end if;
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
    and prize_id = p_prize_id and public.judging_assignment_in_active_pool(id);
  return true;
end;
$$;
