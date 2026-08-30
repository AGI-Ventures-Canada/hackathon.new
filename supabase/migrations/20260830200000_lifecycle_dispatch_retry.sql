CREATE TABLE IF NOT EXISTS public.lifecycle_notification_dispatches (
  id UUID PRIMARY KEY,
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  dispatch_kind TEXT NOT NULL CHECK (
    dispatch_kind IN ('transition', 'challenges_released')
  ),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  fail_count SMALLINT NOT NULL DEFAULT 1 CHECK (fail_count BETWEEN 1 AND 5),
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lifecycle_notification_dispatches_due_idx
  ON public.lifecycle_notification_dispatches (next_attempt_at, created_at)
  WHERE resolved_at IS NULL AND fail_count < 5;

ALTER TABLE public.lifecycle_notification_dispatches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lifecycle_notification_dispatches
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lifecycle_notification_dispatches TO service_role;
