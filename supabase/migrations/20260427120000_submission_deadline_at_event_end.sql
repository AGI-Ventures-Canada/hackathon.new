-- Unify "Submissions Close & Judging Starts" with the hackathon end time.
-- Previously the seeded agenda item fired 60 minutes before ends_at, which
-- visually conflicted with getEffectiveStatus flipping to 'judging' at ends_at.
-- The agenda item now lands exactly on ends_at so the moment is single-sourced.

create or replace function propagate_linked_schedule_times()
returns trigger
language plpgsql
as $$
begin
  if NEW.starts_at is not distinct from OLD.starts_at
     and NEW.ends_at is not distinct from OLD.ends_at then
    return NEW;
  end if;

  if NEW.starts_at is distinct from OLD.starts_at and NEW.starts_at is not null then
    if OLD.starts_at is not null then
      update hackathon_schedule_items
      set starts_at   = NEW.starts_at + (starts_at - OLD.starts_at),
          ends_at     = case when ends_at is null then null
                        else NEW.starts_at + (ends_at - OLD.starts_at) end,
          updated_at  = now()
      where hackathon_id = NEW.id
        and linked_to = 'event_start';
    else
      delete from hackathon_schedule_items
      where hackathon_id = NEW.id and linked_to = 'event_start';

      insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
      values
        (NEW.id, 'Opening Kickoff',   NEW.starts_at, NEW.starts_at + interval '30 minutes', null,                'event_start'),
        (NEW.id, 'Challenge Release', NEW.starts_at, NEW.starts_at,                         'challenge_release', 'event_start'),
        (NEW.id, 'Hacking Begins',    NEW.starts_at + interval '30 minutes', NEW.starts_at + interval '60 minutes', null, 'event_start')
      on conflict do nothing;
    end if;
  end if;

  if NEW.ends_at is distinct from OLD.ends_at and NEW.ends_at is not null then
    if OLD.ends_at is not null then
      update hackathon_schedule_items
      set starts_at   = NEW.ends_at + (starts_at - OLD.ends_at),
          ends_at     = case when ends_at is null then null
                        else NEW.ends_at + (ends_at - OLD.ends_at) end,
          updated_at  = now()
      where hackathon_id = NEW.id
        and linked_to = 'event_end';
    else
      delete from hackathon_schedule_items
      where hackathon_id = NEW.id and linked_to = 'event_end';

      insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
      values
        (NEW.id, 'Submissions Close & Judging Starts', NEW.ends_at, NEW.ends_at, 'submission_deadline', 'event_end'),
        (NEW.id, 'Presentations', NEW.ends_at - interval '30 minutes', NEW.ends_at, null, 'event_end'),
        (NEW.id, 'Awards Ceremony', NEW.ends_at, NEW.ends_at + interval '30 minutes', null, 'event_end')
      on conflict do nothing;
    end if;
  end if;

  return NEW;
end;
$$;

create or replace function seed_default_agenda_items()
returns trigger as $$
declare
  start_ts timestamptz;
  end_ts   timestamptz;
begin
  start_ts := coalesce(
    NEW.starts_at,
    date_trunc('day', now() + interval '14 days') + interval '8 hours 30 minutes'
  );
  end_ts := coalesce(
    NEW.ends_at,
    date_trunc('day', start_ts + interval '1 day') + interval '17 hours'
  );

  insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
  values
    (NEW.id, 'Opening Kickoff',    start_ts,                         start_ts + interval '30 minutes', null,                  'event_start'),
    (NEW.id, 'Challenge Release',  start_ts,                         start_ts,                         'challenge_release',   'event_start'),
    (NEW.id, 'Hacking Begins',     start_ts + interval '30 minutes', start_ts + interval '60 minutes', null,                  'event_start'),
    (NEW.id, 'Submissions Close & Judging Starts', end_ts,           end_ts,                           'submission_deadline', 'event_end'),
    (NEW.id, 'Presentations',      end_ts - interval '30 minutes',   end_ts,                           null,                  'event_end'),
    (NEW.id, 'Awards Ceremony',    end_ts,                           end_ts + interval '30 minutes',   null,                  'event_end')
  on conflict do nothing;

  return NEW;
end;
$$ language plpgsql;

-- Backfill: shift any submission_deadline still at the seeded ends_at - 60m
-- default to ends_at. Customized rows (linked_to = null) are untouched.
update hackathon_schedule_items si
set starts_at = h.ends_at, ends_at = h.ends_at, updated_at = now()
from hackathons h
where si.hackathon_id = h.id
  and si.trigger_type = 'submission_deadline'
  and si.linked_to    = 'event_end'
  and si.starts_at    = h.ends_at - interval '60 minutes';
