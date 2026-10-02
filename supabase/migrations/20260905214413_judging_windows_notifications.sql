ALTER TABLE public.hackathons
  ADD COLUMN IF NOT EXISTS judging_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS judging_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS judging_timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS judging_reminders_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.hackathons ADD CONSTRAINT hackathon_judging_window_valid
  CHECK ((judging_opens_at IS NULL AND judging_closes_at IS NULL) OR
    (judging_opens_at IS NOT NULL AND judging_closes_at IS NOT NULL AND judging_closes_at > judging_opens_at));
ALTER TABLE public.judging_rounds
  ADD COLUMN IF NOT EXISTS opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;
ALTER TABLE public.judging_rounds ADD CONSTRAINT round_judging_window_valid
  CHECK ((opens_at IS NULL AND closes_at IS NULL) OR
    (opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at));
CREATE TABLE IF NOT EXISTS public.judging_notification_preferences (
  hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  daily_digest boolean NOT NULL DEFAULT false,
  timezone text,
  quiet_start smallint NOT NULL DEFAULT 20 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end smallint NOT NULL DEFAULT 8 CHECK (quiet_end BETWEEN 0 AND 23),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hackathon_id, clerk_user_id)
);
CREATE TABLE IF NOT EXISTS public.judging_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  round_id uuid REFERENCES public.judging_rounds(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('preparation','work_ready','work_added','scores_due','deadline_changed','all_done','organizer_readiness','organizer_progress','daily_digest','manual_reminder')),
  identity text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_path text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  email_required boolean NOT NULL DEFAULT true,
  email_sent_at timestamptz,
  read_at timestamptz,
  resolved_at timestamptz,
  fail_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hackathon_id, clerk_user_id, kind, identity)
);
CREATE INDEX IF NOT EXISTS judging_notifications_inbox_idx ON public.judging_notifications(hackathon_id, clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS judging_notifications_due_idx ON public.judging_notifications(scheduled_for, next_attempt_at) WHERE email_sent_at IS NULL AND resolved_at IS NULL AND email_required;
ALTER TABLE public.judging_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to judging notification preferences" ON public.judging_notification_preferences FOR ALL USING (false);
ALTER TABLE public.judging_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to judging notifications" ON public.judging_notifications FOR ALL USING (false);
GRANT ALL ON public.judging_notification_preferences, public.judging_notifications TO service_role;
ALTER TABLE public.judge_invitations
  ADD COLUMN IF NOT EXISTS delivery_fail_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_last_error text,
  ADD COLUMN IF NOT EXISTS reminders_stopped_at timestamptz;
CREATE OR REPLACE FUNCTION public.judging_window_is_open(p_hackathon_id uuid, p_round_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE
    WHEN h.status::text NOT IN ('active','judging') OR h.results_published_at IS NOT NULL THEN false
    WHEN p_round_id IS NOT NULL AND (r.id IS NULL OR r.status::text<>'active') THEN false
    WHEN coalesce(r.opens_at,h.judging_opens_at) IS NULL AND coalesce(r.closes_at,h.judging_closes_at) IS NULL THEN h.status::text='judging' OR coalesce(h.phase::text IN ('preliminaries','finals'),false) OR coalesce(r.status::text='active',false)
    ELSE now() >= coalesce(r.opens_at,h.judging_opens_at) AND now() < coalesce(r.closes_at,h.judging_closes_at)
  END FROM public.hackathons h
  LEFT JOIN public.judging_rounds r ON r.id=p_round_id AND r.hackathon_id=h.id WHERE h.id=p_hackathon_id
$$;
REVOKE ALL ON FUNCTION public.judging_window_is_open(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.judging_window_is_open(uuid,uuid) TO service_role;
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
  IF v_hackathon_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.hackathons WHERE id=v_hackathon_id AND judging_opens_at IS NOT NULL) OR EXISTS (SELECT 1 FROM public.judging_rounds WHERE id=v_round_id AND opens_at IS NOT NULL))
    AND NOT public.judging_window_is_open(v_hackathon_id,v_round_id) THEN
    RAISE EXCEPTION 'Judging is not open for scores' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_judging_window() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_judging_window() TO service_role;
CREATE TRIGGER scoring_window_scores BEFORE INSERT OR UPDATE ON public.scores FOR EACH ROW EXECUTE FUNCTION public.enforce_judging_window();
CREATE TRIGGER scoring_window_binary BEFORE INSERT OR UPDATE ON public.binary_responses FOR EACH ROW EXECUTE FUNCTION public.enforce_judging_window();
CREATE TRIGGER scoring_window_bucket BEFORE INSERT OR UPDATE ON public.bucket_responses FOR EACH ROW EXECUTE FUNCTION public.enforce_judging_window();
CREATE TRIGGER scoring_window_picks BEFORE INSERT OR UPDATE ON public.judge_picks FOR EACH ROW EXECUTE FUNCTION public.enforce_judging_window();
CREATE OR REPLACE FUNCTION public.effective_hackathon_status(status public.hackathon_status, starts_at timestamptz, ends_at timestamptz)
RETURNS public.hackathon_status LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT CASE WHEN status::text IN ('draft','completed','archived') THEN status
    WHEN status::text IN ('published','registration_open') AND starts_at <= now() THEN 'active'::public.hackathon_status
    ELSE status END
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
    opens_at = case when p_updates ? 'opens_at' then (p_updates->>'opens_at')::timestamptz else opens_at end,
    closes_at = case when p_updates ? 'closes_at' then (p_updates->>'closes_at')::timestamptz else closes_at end,
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
    hackathon_id, name, round_type, is_active, display_order, opens_at, closes_at,
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
    (p_values->>'opens_at')::timestamptz, (p_values->>'closes_at')::timestamptz,
    coalesce((p_values->>'status')::public.round_status, 'planned'),
    coalesce((p_values->>'advancement')::public.advancement_rule, 'manual'),
    coalesce(p_values->'advancement_config', '{}'::jsonb)
  ) returning * into v_round;
  return to_jsonb(v_round);
end;
$$;


ALTER TABLE public.judge_invitations
 ADD COLUMN IF NOT EXISTS personal_message text,
 ADD COLUMN IF NOT EXISTS requested_prize_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS requested_room_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS scope_applied_at timestamptz;
CREATE TABLE IF NOT EXISTS public.judging_invitation_batches (
 hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 actor_id text NOT NULL,
 payload_hash text NOT NULL,
 response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(hackathon_id,actor_id,request_key)
);
ALTER TABLE public.judging_invitation_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to judging invitation batches" ON public.judging_invitation_batches FOR ALL USING (false);
GRANT ALL ON public.judging_invitation_batches TO service_role;

UPDATE public.judge_invitations SET scope_applied_at=now() WHERE scope_applied_at IS NULL AND cardinality(requested_prize_ids)=0 AND cardinality(requested_room_ids)=0;

ALTER TABLE public.judge_pending_notifications
 ADD COLUMN IF NOT EXISTS requested_prize_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS requested_room_ids uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS scope_applied_at timestamptz;
UPDATE public.judge_pending_notifications SET scope_applied_at=now() WHERE scope_applied_at IS NULL;

CREATE OR REPLACE FUNCTION public.hold_accepted_judge_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.status='accepted' AND OLD.status IS DISTINCT FROM 'accepted'
   AND (cardinality(NEW.requested_prize_ids)>0 OR cardinality(NEW.requested_room_ids)>0) THEN
   UPDATE public.hackathon_participants SET judging_scope_ready=false
    WHERE hackathon_id=NEW.hackathon_id AND clerk_user_id=NEW.accepted_by_clerk_user_id AND role='judge';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hold_accepted_judge_scope() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hold_accepted_judge_scope() TO service_role;
CREATE TRIGGER hold_judge_scope_on_accept AFTER UPDATE OF status ON public.judge_invitations
 FOR EACH ROW EXECUTE FUNCTION public.hold_accepted_judge_scope();

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
  if exists(select 1 from public.prizes p left join public.judging_rounds r on r.id=p.round_id
    where p.id=p_prize_id and (v_hackathon.judging_opens_at is not null or r.opens_at is not null))
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
  if exists(select 1 from public.prizes p left join public.judging_rounds r on r.id=p.round_id
    where p.id=p_prize_id and (v_hackathon.judging_opens_at is not null or r.opens_at is not null))
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
  if exists(select 1 from public.hackathons h join public.prizes p on p.hackathon_id=h.id left join public.judging_rounds r on r.id=p.round_id
    where h.id=p_hackathon_id and p.id=p_prize_id and (h.judging_opens_at is not null or r.opens_at is not null))
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
    and prize_id = p_prize_id;
  return true;
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
  if v_hackathon.status::text in ('completed', 'archived') or v_hackathon.results_published_at is not null or (v_hackathon.judging_closes_at is not null and now() >= v_hackathon.judging_closes_at) then return query select false, 'hackathon_ended'::text, null::uuid, null::text, '{}'::uuid[]; return; end if;

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
