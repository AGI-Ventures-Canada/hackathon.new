-- Fix: default agenda items now move when hackathon dates change.
-- Previously only 'Challenge Release' (linked_to = 'event_start') was updated.
-- Now all six default items recalculate relative to the new start/end times.

create or replace function propagate_linked_schedule_times()
returns trigger
language plpgsql
as $$
declare
  old_start_anchor timestamptz;
  old_end_anchor   timestamptz;
  sub_close        timestamptz;
begin
  if NEW.starts_at is not distinct from OLD.starts_at
     and NEW.ends_at is not distinct from OLD.ends_at then
    return NEW;
  end if;

  -- When old anchor is known, shift items by the delta.
  -- When old anchor is NULL (first time setting dates), we can't compute a
  -- reliable delta because the seed function used now() at insert time.
  -- In that case, delete the seeded items and re-insert with correct times.

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

      if (NEW.ends_at - coalesce(NEW.starts_at, NEW.ends_at)) >= interval '1 hour' then
        sub_close := NEW.ends_at - interval '60 minutes';
      else
        sub_close := NEW.ends_at;
      end if;

      insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
      values
        (NEW.id, 'Submissions Close & Judging Starts', sub_close, sub_close, 'submission_deadline', 'event_end'),
        (NEW.id, 'Presentations', NEW.ends_at - interval '30 minutes', NEW.ends_at, null, 'event_end'),
        (NEW.id, 'Awards Ceremony', NEW.ends_at, NEW.ends_at + interval '30 minutes', null, 'event_end')
      on conflict do nothing;
    end if;
  end if;

  return NEW;
end;
$$;

-- Link all default seed items to their anchor point so they move with date changes.
-- seed_default_agenda_items sets linked_to at creation time going forward.
create or replace function seed_default_agenda_items()
returns trigger as $$
declare
  start_ts timestamptz;
  end_ts   timestamptz;
  sub_close_ts timestamptz;
begin
  start_ts := coalesce(
    NEW.starts_at,
    date_trunc('day', now() + interval '14 days') + interval '8 hours 30 minutes'
  );
  end_ts := coalesce(
    NEW.ends_at,
    date_trunc('day', start_ts + interval '1 day') + interval '17 hours'
  );

  if (end_ts - start_ts) >= interval '1 hour' then
    sub_close_ts := end_ts - interval '60 minutes';
  else
    sub_close_ts := end_ts;
  end if;

  insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
  values
    (NEW.id, 'Opening Kickoff',    start_ts,                         start_ts + interval '30 minutes', null,                  'event_start'),
    (NEW.id, 'Challenge Release',  start_ts,                         start_ts,                         'challenge_release',   'event_start'),
    (NEW.id, 'Hacking Begins',     start_ts + interval '30 minutes', start_ts + interval '60 minutes', null,                  'event_start'),
    (NEW.id, 'Submissions Close & Judging Starts', sub_close_ts,     sub_close_ts,                     'submission_deadline', 'event_end'),
    (NEW.id, 'Presentations',      end_ts - interval '30 minutes',   end_ts,                           null,                  'event_end'),
    (NEW.id, 'Awards Ceremony',    end_ts,                           end_ts + interval '30 minutes',   null,                  'event_end')
  on conflict do nothing;

  return NEW;
end;
$$ language plpgsql;

-- Backfill: link existing default items to their anchor points.
-- Start-anchored items
update hackathon_schedule_items
set linked_to = 'event_start', updated_at = now()
where linked_to is null
  and title in ('Opening Kickoff', 'Hacking Begins');

-- End-anchored items
update hackathon_schedule_items
set linked_to = 'event_end', updated_at = now()
where linked_to is null
  and title in ('Submissions Close & Judging Starts', 'Presentations', 'Awards Ceremony');
