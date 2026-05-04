-- Close gaps in the deny-all RLS posture so every public table is
-- inaccessible to anon/authenticated and only reachable via the service key.
-- See supabase/CLAUDE.md "Service Key Only Access".

ALTER TABLE judge_pending_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access to hackathon_sponsors" ON hackathon_sponsors;
CREATE POLICY "Deny all access to hackathon_sponsors" ON hackathon_sponsors FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all access to jobs" ON jobs;
CREATE POLICY "Deny all access to jobs" ON jobs FOR ALL USING (false);

DROP POLICY IF EXISTS "Deny all access to judge_pending_notifications" ON judge_pending_notifications;
CREATE POLICY "Deny all access to judge_pending_notifications" ON judge_pending_notifications FOR ALL USING (false);
