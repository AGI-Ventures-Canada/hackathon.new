alter table public.prize_assignments
  add column if not exists assignment_source text not null default 'manual'
  check (assignment_source in ('manual', 'automatic'));

create index if not exists idx_prize_assignments_automatic
  on public.prize_assignments(prize_id)
  where assignment_source = 'automatic';

create or replace function public.replace_subjective_results_atomic(
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
  from public.hackathons
  where id = p_hackathon_id
  for update;

  if not found then
    raise exception 'Hackathon not found';
  end if;
  if v_results_published_at is not null then
    raise exception 'Results are published';
  end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'Results must be an array';
  end if;

  for v_result in
    select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    if not exists (
      select 1
      from public.submissions
      where id = (v_result->>'submission_id')::uuid
        and hackathon_id = p_hackathon_id
    ) then
      raise exception 'Submission does not belong to this hackathon';
    end if;
  end loop;

  delete from public.hackathon_results
  where hackathon_id = p_hackathon_id
    and prize_id is null
    and prize_track_id is null
    and round_id is null;

  for v_result in
    select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    insert into public.hackathon_results (
      hackathon_id,
      submission_id,
      rank,
      total_score,
      weighted_score,
      judge_count,
      prize_id,
      result_kind
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

revoke all on function public.replace_subjective_results_atomic(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_subjective_results_atomic(uuid, jsonb)
  to service_role;
