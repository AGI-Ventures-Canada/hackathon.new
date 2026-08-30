ALTER TABLE public.judge_pending_notifications
  ADD COLUMN IF NOT EXISTS fail_count SMALLINT NOT NULL DEFAULT 0
    CHECK (fail_count BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS judge_pending_notifications_retry_due_idx
  ON public.judge_pending_notifications (next_attempt_at, created_at)
  WHERE sent_at IS NULL AND fail_count < 5;
