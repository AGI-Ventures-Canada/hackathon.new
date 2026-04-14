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

  insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type)
  values
    (NEW.id, 'Opening Kickoff',    start_ts,                    start_ts + interval '30 minutes', null),
    (NEW.id, 'Challenge Release',  start_ts,                    start_ts,                         'challenge_release'),
    (NEW.id, 'Hacking Begins',     start_ts + interval '30 minutes', start_ts + interval '60 minutes', null),
    (NEW.id, 'Submissions Close',  end_ts - interval '60 minutes',   end_ts - interval '60 minutes',   'submission_deadline'),
    (NEW.id, 'Presentations',      end_ts - interval '30 minutes',   end_ts,                           null),
    (NEW.id, 'Awards Ceremony',    end_ts,                           end_ts + interval '30 minutes',   null)
  on conflict do nothing;

  return NEW;
end;
$$ language plpgsql;

comment on function seed_default_agenda_items() is
  'Auto-creates 6 default agenda items when a hackathon is inserted. Derives times from starts_at/ends_at with fallback defaults.';

drop trigger if exists trg_hackathon_seed_agenda on hackathons;

create trigger trg_hackathon_seed_agenda
  after insert on hackathons
  for each row execute function seed_default_agenda_items();

-- Backfill: create agenda items for existing hackathons that have none
insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type)
select
  h.id,
  item.title,
  case
    when item.offset_from = 'start' then coalesce(h.starts_at, date_trunc('day', now() + interval '14 days') + interval '8 hours 30 minutes') + (item.offset_minutes * interval '1 minute')
    else coalesce(h.ends_at, date_trunc('day', coalesce(h.starts_at, now() + interval '14 days') + interval '1 day') + interval '17 hours') + (item.offset_minutes * interval '1 minute')
  end as starts_at,
  case
    when item.end_offset_from = 'start' then coalesce(h.starts_at, date_trunc('day', now() + interval '14 days') + interval '8 hours 30 minutes') + (item.end_offset_minutes * interval '1 minute')
    else coalesce(h.ends_at, date_trunc('day', coalesce(h.starts_at, now() + interval '14 days') + interval '1 day') + interval '17 hours') + (item.end_offset_minutes * interval '1 minute')
  end as ends_at,
  item.trigger_type
from hackathons h
cross join (
  values
    ('Opening Kickoff',   'start', 0,   'start', 30,  null::text),
    ('Challenge Release', 'start', 0,   'start', 0,   'challenge_release'),
    ('Hacking Begins',    'start', 30,  'start', 60,  null),
    ('Submissions Close', 'end',   -60, 'end',   -60, 'submission_deadline'),
    ('Presentations',     'end',   -30, 'end',   0,   null),
    ('Awards Ceremony',   'end',   0,   'end',   30,  null)
) as item(title, offset_from, offset_minutes, end_offset_from, end_offset_minutes, trigger_type)
where not exists (
  select 1 from hackathon_schedule_items si where si.hackathon_id = h.id
);
