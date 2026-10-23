CREATE TABLE IF NOT EXISTS public.reminder_deliveries (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{24}$'),
  hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('judge_judging','organizer_judging','participant_event','organizer_event','team_invitation','judge_invitation','prize_claim','organizer_fulfillment','feedback')),
  recipient_email text NOT NULL CHECK (recipient_email = lower(trim(recipient_email))),
  recipient_user_id text,
  recipient_key text NOT NULL,
  provider_message_id text UNIQUE,
  accepted_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((accepted_at IS NULL) = (provider_message_id IS NULL))
);
CREATE TABLE IF NOT EXISTS public.reminder_reply_audits (
  id text PRIMARY KEY,
  delivery_id text REFERENCES public.reminder_deliveries(id) ON DELETE SET NULL,
  sender_hash text NOT NULL,
  body_hash text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('applied','already_suppressed','review_required')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reminder_suppressions (
  hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  category text NOT NULL,
  recipient_key text NOT NULL,
  source_reply_id text NOT NULL REFERENCES public.reminder_reply_audits(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hackathon_id, category, recipient_key)
);
CREATE INDEX IF NOT EXISTS reminder_deliveries_event_idx ON public.reminder_deliveries(hackathon_id, category);
CREATE INDEX IF NOT EXISTS reminder_reply_review_idx ON public.reminder_reply_audits(created_at) WHERE outcome = 'review_required';
CREATE INDEX IF NOT EXISTS reminder_reply_delivery_idx ON public.reminder_reply_audits(delivery_id);
CREATE INDEX IF NOT EXISTS reminder_suppression_reply_idx ON public.reminder_suppressions(source_reply_id);
ALTER TABLE public.reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_reply_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to reminder deliveries" ON public.reminder_deliveries FOR ALL USING (false);
CREATE POLICY "Deny all access to reminder replies" ON public.reminder_reply_audits FOR ALL USING (false);
CREATE POLICY "Deny all access to reminder suppressions" ON public.reminder_suppressions FOR ALL USING (false);
REVOKE ALL ON public.reminder_deliveries, public.reminder_reply_audits, public.reminder_suppressions FROM anon, authenticated;
GRANT ALL ON public.reminder_deliveries, public.reminder_reply_audits, public.reminder_suppressions TO service_role;

CREATE OR REPLACE FUNCTION public.record_reminder_reply(
  p_reply_id text, p_delivery_id text, p_sender_hash text, p_body_hash text,
  p_verified boolean, p_reason text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  delivery public.reminder_deliveries%ROWTYPE;
  outcome text;
  inserted integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('reminder-reply:' || p_reply_id, 0));
  SELECT a.outcome INTO outcome FROM public.reminder_reply_audits a WHERE a.id = p_reply_id;
  IF FOUND THEN RETURN outcome; END IF;
  SELECT * INTO delivery FROM public.reminder_deliveries WHERE id = p_delivery_id FOR UPDATE;
  outcome := 'review_required';
  IF p_verified AND delivery.accepted_at IS NOT NULL THEN
    outcome := CASE WHEN EXISTS (
      SELECT 1 FROM public.reminder_suppressions s WHERE s.hackathon_id = delivery.hackathon_id
      AND s.category = delivery.category AND s.recipient_key = delivery.recipient_key
    ) THEN 'already_suppressed' ELSE 'applied' END;
  END IF;
  INSERT INTO public.reminder_reply_audits(id,delivery_id,sender_hash,body_hash,outcome,reason)
    VALUES(p_reply_id,delivery.id,p_sender_hash,p_body_hash,outcome,p_reason);
  IF outcome IN ('applied','already_suppressed') THEN
    INSERT INTO public.reminder_suppressions(hackathon_id,category,recipient_key,source_reply_id)
      VALUES(delivery.hackathon_id,delivery.category,delivery.recipient_key,p_reply_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted = 0 THEN
      outcome := 'already_suppressed';
      UPDATE public.reminder_reply_audits SET outcome = 'already_suppressed' WHERE id = p_reply_id;
    END IF;
  END IF;
  RETURN outcome;
END;
$$;
REVOKE ALL ON FUNCTION public.record_reminder_reply(text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_reminder_reply(text,text,text,text,boolean,text) TO service_role;
