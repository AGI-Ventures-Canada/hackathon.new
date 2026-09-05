alter table public.hackathons
  add column if not exists judging_instructions text not null default '',
  add column if not exists judging_browse_enabled boolean not null default false,
  add column if not exists judging_target_reviews integer not null default 3 check (judging_target_reviews between 1 and 20);

create table if not exists public.judging_setup_requests (
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  request_key text not null check (length(request_key) between 1 and 200),
  fingerprint text not null,
  created_at timestamptz not null default now(),
  primary key (hackathon_id, request_key)
);
alter table public.judging_setup_requests enable row level security;
create policy "Deny all access to judging_setup_requests" on public.judging_setup_requests for all using (false);
revoke all on public.judging_setup_requests from anon, authenticated;
grant all on public.judging_setup_requests to service_role;

create or replace function public.configure_judging_setup(
  p_hackathon_id uuid,
  p_expected_updated_at timestamptz,
  p_request_key text,
  p_settings jsonb default '{}',
  p_apply_starter boolean default false,
  p_prize_name text default 'Best overall'
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_event public.hackathons%rowtype;
  v_fingerprint text;
  v_existing text;
  v_opens timestamptz;
  v_closes timestamptz;
  v_timezone text;
  v_name text;
  v_description text;
  v_index integer := 0;
begin
  select * into v_event from public.hackathons where id = p_hackathon_id for update;
  if not found then raise exception 'Event not found'; end if;
  if p_request_key is null or length(p_request_key) not between 1 and 200 then raise exception 'Invalid request key'; end if;
  v_fingerprint := md5(jsonb_build_object('settings', p_settings, 'starter', p_apply_starter, 'prize', p_prize_name)::text);
  select fingerprint into v_existing from public.judging_setup_requests where hackathon_id = p_hackathon_id and request_key = p_request_key;
  if found then
    if v_existing <> v_fingerprint then raise exception 'judging_changed: request key reused'; end if;
    return jsonb_build_object('saved', true, 'replayed', true);
  end if;
  if v_event.updated_at is distinct from p_expected_updated_at then raise exception 'judging_changed'; end if;
  if v_event.results_published_at is not null or v_event.status::text in ('completed', 'archived') then raise exception 'judging_locked'; end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'Invalid settings'; end if;
  v_opens := case when p_settings ? 'opensAt' then (p_settings->>'opensAt')::timestamptz else v_event.judging_opens_at end;
  v_closes := case when p_settings ? 'closesAt' then (p_settings->>'closesAt')::timestamptz else v_event.judging_closes_at end;
  v_timezone := case when p_settings ? 'timezone' then p_settings->>'timezone' else v_event.judging_timezone end;
  if (v_opens is null) <> (v_closes is null) or v_closes <= v_opens then raise exception 'Set a judging opening and a later deadline'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then raise exception 'Choose a valid timezone'; end if;
  if p_settings ? 'instructions' and length(p_settings->>'instructions') > 5000 then raise exception 'Judging instructions are too long'; end if;
  if p_settings ? 'targetReviewsPerProject' and (p_settings->>'targetReviewsPerProject')::integer not between 1 and 20 then raise exception 'Choose between 1 and 20 judges per project'; end if;
  if p_apply_starter then
    if exists (select 1 from public.judge_assignments where hackathon_id = p_hackathon_id and is_complete)
      or exists (select 1 from public.judge_picks where hackathon_id = p_hackathon_id)
      or exists (select 1 from public.judging_rounds where hackathon_id = p_hackathon_id)
      or exists (select 1 from public.judging_criteria where hackathon_id = p_hackathon_id) then
      raise exception 'judging_locked: keep your existing scorecard';
    end if;
    if not exists (select 1 from public.prizes where hackathon_id = p_hackathon_id) then
      if length(btrim(p_prize_name)) not between 1 and 200 then raise exception 'Enter a prize name'; end if;
      insert into public.prizes(hackathon_id,name,judging_style,assignment_mode,type,rank,display_order)
      values (p_hackathon_id,btrim(p_prize_name),'weighted_score','organizer_assigned','score',1,0);
    end if;
    for v_name, v_description in select * from (values
      ('Original idea','How original and creative is the idea?'),
      ('Does it work?','How well is it built? Does it work?'),
      ('Easy to use','How easy and pleasant is it to use?'),
      ('Usefulness','How useful is this? Who benefits?')
    ) as defaults(name,description) loop
      insert into public.judging_criteria(hackathon_id,name,description,weight,min_score,max_score,display_order)
      values (p_hackathon_id,v_name,v_description,25,0,10,v_index);
      v_index := v_index + 1;
    end loop;
  end if;
  update public.hackathons set
    judging_opens_at = v_opens,
    judging_closes_at = v_closes,
    judging_timezone = v_timezone,
    judging_instructions = case when p_settings ? 'instructions' then p_settings->>'instructions' else judging_instructions end,
    judging_browse_enabled = case when p_settings ? 'browseEnabled' then (p_settings->>'browseEnabled')::boolean else judging_browse_enabled end,
    judging_target_reviews = case when p_settings ? 'targetReviewsPerProject' then (p_settings->>'targetReviewsPerProject')::integer else judging_target_reviews end,
    judging_reminders_enabled = case when p_settings ? 'remindersEnabled' then (p_settings->>'remindersEnabled')::boolean else judging_reminders_enabled end,
    updated_at = clock_timestamp()
  where id = p_hackathon_id;
  insert into public.judging_setup_requests(hackathon_id,request_key,fingerprint) values(p_hackathon_id,p_request_key,v_fingerprint);
  return jsonb_build_object('saved',true,'replayed',false);
end;
$$;
revoke all on function public.configure_judging_setup(uuid,timestamptz,text,jsonb,boolean,text) from public, anon, authenticated;
grant execute on function public.configure_judging_setup(uuid,timestamptz,text,jsonb,boolean,text) to service_role;
