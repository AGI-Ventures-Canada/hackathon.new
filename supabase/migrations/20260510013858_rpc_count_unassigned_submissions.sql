-- Targeted count for the "X projects waiting for a judge" action item
-- on the manage page's first render. Avoids re-running the full
-- get_organizer_poll_data RPC just to read one field.

create or replace function count_unassigned_submissions(p_hackathon_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer from submissions s
  where s.hackathon_id = p_hackathon_id
    and s.status = 'submitted'
    and not exists (
      select 1 from judge_assignments ja where ja.submission_id = s.id
    );
$$;
