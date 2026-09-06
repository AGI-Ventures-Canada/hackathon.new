CREATE TABLE IF NOT EXISTS public.judging_review_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  judge_participant_id uuid NOT NULL REFERENCES public.hackathon_participants(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.judge_assignments(id) ON DELETE CASCADE,
  prize_id uuid REFERENCES public.prizes(id) ON DELETE CASCADE,
  response jsonb,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  criteria_version text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((assignment_id IS NOT NULL)::integer + (prize_id IS NOT NULL)::integer = 1),
  CHECK (response IS NULL OR jsonb_typeof(response) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS judging_review_drafts_assignment ON public.judging_review_drafts(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS judging_review_drafts_ballot ON public.judging_review_drafts(judge_participant_id, prize_id) WHERE prize_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS judging_review_drafts_event_judge ON public.judging_review_drafts(hackathon_id, judge_participant_id);
ALTER TABLE public.judging_review_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to judging_review_drafts" ON public.judging_review_drafts FOR ALL USING (false);
REVOKE ALL ON public.judging_review_drafts FROM anon, authenticated;
GRANT ALL ON public.judging_review_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.judging_pick_review_version(p_prize_id uuid, p_judge_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT md5(jsonb_build_object('prize', p.id, 'maxPicks', p.max_picks, 'round', p.round_id,
    'projects', COALESCE((SELECT jsonb_agg(a.submission_id ORDER BY a.submission_id) FROM public.judge_assignments a WHERE a.prize_id = p.id AND a.judge_participant_id = p_judge_id), '[]'::jsonb))::text)
  FROM public.prizes p WHERE p.id = p_prize_id AND p.judging_style = 'judges_pick';
$$;
REVOKE ALL ON FUNCTION public.judging_pick_review_version(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.judging_pick_review_version(uuid,uuid) TO service_role;

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
    IF NOT EXISTS (SELECT 1 FROM public.judge_assignments WHERE prize_id = p_prize_id AND judge_participant_id = p_judge_id AND hackathon_id = p_hackathon_id) THEN RAISE EXCEPTION 'review_not_found'; END IF;
    FOR v_entry IN SELECT value FROM jsonb_array_elements_text(p_response->'rankedSubmissionIds') LOOP
      IF NOT EXISTS (SELECT 1 FROM public.judge_assignments a JOIN public.submissions s ON s.id = a.submission_id WHERE a.prize_id = p_prize_id AND a.judge_participant_id = p_judge_id AND a.hackathon_id = p_hackathon_id AND a.submission_id = v_entry.value::uuid AND (v_judge_team_id IS NULL OR s.team_id IS DISTINCT FROM v_judge_team_id)) THEN RAISE EXCEPTION 'project_not_assigned'; END IF;
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
      UPDATE public.judge_assignments SET is_complete = true,completed_at = now() WHERE prize_id = p_prize_id AND judge_participant_id = p_judge_id AND hackathon_id = p_hackathon_id;
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

CREATE OR REPLACE FUNCTION public.guard_judging_review_draft() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_assignment_id uuid; v_prize_id uuid; v_judge_id uuid; v_event_id uuid; v_review public.judging_review_drafts%rowtype;
BEGIN
  IF current_setting('app.judging_review_write',true) = 'on' THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_TABLE_NAME = 'judge_picks' THEN
    v_prize_id := COALESCE(NEW.prize_id,OLD.prize_id); v_judge_id := COALESCE(NEW.judge_participant_id,OLD.judge_participant_id);
  ELSIF TG_TABLE_NAME = 'judge_assignments' THEN v_assignment_id := NEW.id;
  ELSE v_assignment_id := COALESCE(NEW.judge_assignment_id,OLD.judge_assignment_id); END IF;
  IF TG_OP = 'DELETE' AND ((v_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.judge_assignments WHERE id = v_assignment_id)) OR (v_prize_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.prizes WHERE id = v_prize_id) OR NOT EXISTS (SELECT 1 FROM public.hackathon_participants WHERE id = v_judge_id)))) THEN RETURN OLD; END IF;
  IF v_assignment_id IS NOT NULL THEN SELECT hackathon_id,judge_participant_id INTO v_event_id,v_judge_id FROM public.judge_assignments WHERE id = v_assignment_id;
  ELSE SELECT hackathon_id INTO v_event_id FROM public.prizes WHERE id = v_prize_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hackathons WHERE id = v_event_id) OR NOT EXISTS (SELECT 1 FROM public.hackathon_participants WHERE id = v_judge_id) THEN RETURN COALESCE(NEW,OLD); END IF;
  INSERT INTO public.judging_review_drafts(hackathon_id,judge_participant_id,assignment_id,prize_id,criteria_version)
  VALUES(v_event_id,v_judge_id,v_assignment_id,v_prize_id,'') ON CONFLICT DO NOTHING;
  SELECT * INTO v_review FROM public.judging_review_drafts WHERE (v_assignment_id IS NOT NULL AND assignment_id = v_assignment_id) OR (v_prize_id IS NOT NULL AND prize_id = v_prize_id AND judge_participant_id = v_judge_id) FOR UPDATE;
  IF FOUND THEN
    IF v_review.response IS NOT NULL THEN RAISE EXCEPTION 'review_changed: Open judging to submit your saved draft'; END IF;
    UPDATE public.judging_review_drafts SET revision = revision + 1,updated_at = now() WHERE id = v_review.id;
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
CREATE TRIGGER protect_score_review_draft BEFORE INSERT OR UPDATE OR DELETE ON public.scores FOR EACH ROW EXECUTE FUNCTION public.guard_judging_review_draft();
CREATE TRIGGER protect_gate_review_draft BEFORE INSERT OR UPDATE OR DELETE ON public.binary_responses FOR EACH ROW EXECUTE FUNCTION public.guard_judging_review_draft();
CREATE TRIGGER protect_bucket_review_draft BEFORE INSERT OR UPDATE OR DELETE ON public.bucket_responses FOR EACH ROW EXECUTE FUNCTION public.guard_judging_review_draft();
CREATE TRIGGER protect_pick_review_draft BEFORE INSERT OR UPDATE OR DELETE ON public.judge_picks FOR EACH ROW EXECUTE FUNCTION public.guard_judging_review_draft();
CREATE TRIGGER protect_assignment_review_draft BEFORE UPDATE OF notes,is_complete ON public.judge_assignments FOR EACH ROW WHEN (OLD.notes IS DISTINCT FROM NEW.notes OR OLD.is_complete IS DISTINCT FROM NEW.is_complete) EXECUTE FUNCTION public.guard_judging_review_draft();
REVOKE ALL ON FUNCTION public.guard_judging_review_draft() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_judging_review_draft() TO service_role;
