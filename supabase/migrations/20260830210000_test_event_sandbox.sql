alter table public.hackathons
  add column if not exists is_test_event boolean not null default false;

create index if not exists idx_hackathons_test_events
  on public.hackathons(tenant_id, created_at desc)
  where is_test_event = true;

comment on column public.hackathons.is_test_event is
  'Marks an organizer-owned sandbox event. Test events are hidden from public listings and cannot send notifications.';

create or replace function public.convert_test_event_to_draft(
  p_hackathon_id uuid,
  p_tenant_id uuid
)
returns table(id uuid, slug text, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.hackathons%rowtype;
begin
  select * into v_event
  from public.hackathons h
  where h.id = p_hackathon_id
    and h.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'test_event_not_found';
  end if;
  if not v_event.is_test_event then
    raise exception 'not_test_event';
  end if;

  delete from public.attendee_lifecycle_notifications where hackathon_id = p_hackathon_id;
  delete from public.scheduled_reminders where hackathon_id = p_hackathon_id;
  delete from public.post_event_reminders where hackathon_id = p_hackathon_id;
  delete from public.lifecycle_notification_dispatches where hackathon_id = p_hackathon_id;
  delete from public.hackathon_notification_settings where hackathon_id = p_hackathon_id;
  delete from public.organizer_action_item_state
  where hackathon_id = p_hackathon_id
    and item_kind = 'generated';
  delete from public.judge_invitations where hackathon_id = p_hackathon_id;
  delete from public.team_invitations where hackathon_id = p_hackathon_id;
  delete from public.hackathon_judges_display where hackathon_id = p_hackathon_id;
  delete from public.hackathon_terms_acceptances where hackathon_id = p_hackathon_id;
  delete from public.mentor_requests where hackathon_id = p_hackathon_id;
  delete from public.submissions where hackathon_id = p_hackathon_id;

  update public.hackathon_participants
  set team_id = null
  where hackathon_id = p_hackathon_id;

  delete from public.teams where hackathon_id = p_hackathon_id;
  delete from public.hackathon_participants where hackathon_id = p_hackathon_id;

  update public.hackathon_perks
  set released_at = null,
      scheduled_release_at = null,
      updated_at = now()
  where hackathon_id = p_hackathon_id;

  update public.hackathon_announcements
  set published_at = null,
      updated_at = now()
  where hackathon_id = p_hackathon_id;

  return query
  update public.hackathons h
  set is_test_event = false,
      status = 'draft',
      phase = null,
      challenge_released_at = null,
      results_published_at = null,
      winner_emails_sent_at = null,
      results_announcement_sent_at = null,
      feedback_survey_sent_at = null,
      metadata = (
        coalesce(h.metadata, '{}'::jsonb)
        - 'sandboxStage'
        - 'sandboxFixtureState'
        - 'sandboxStartedAt'
        - 'sandboxTimeZone'
        - 'notificationsSuppressed'
        - 'aggregate_creation'
      ) || jsonb_build_object('sandboxConvertedAt', now()),
      updated_at = now()
  where h.id = p_hackathon_id
    and h.tenant_id = p_tenant_id
    and h.is_test_event = true
  returning h.id, h.slug, h.name;
end;
$$;

revoke all on function public.convert_test_event_to_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.convert_test_event_to_draft(uuid, uuid)
  to service_role;
