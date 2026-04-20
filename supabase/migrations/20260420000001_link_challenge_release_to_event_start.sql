create or replace function propagate_linked_schedule_times()
returns trigger
language plpgsql
as $$
begin
  if NEW.starts_at is distinct from OLD.starts_at then
    update hackathon_schedule_items
    set starts_at = NEW.starts_at,
        ends_at = case
          when ends_at is null then null
          else NEW.starts_at + (ends_at - starts_at)
        end,
        updated_at = now()
    where hackathon_id = NEW.id
      and linked_to = 'event_start';
  end if;

  if NEW.ends_at is distinct from OLD.ends_at then
    update hackathon_schedule_items
    set starts_at = NEW.ends_at,
        ends_at = case
          when ends_at is null then null
          else NEW.ends_at + (ends_at - starts_at)
        end,
        updated_at = now()
    where hackathon_id = NEW.id
      and linked_to = 'event_end';
  end if;

  return NEW;
end;
$$;

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
    (NEW.id, 'Opening Kickoff',    start_ts,                         start_ts + interval '30 minutes', null,                   null),
    (NEW.id, 'Challenge Release',  start_ts,                         start_ts,                         'challenge_release',    'event_start'),
    (NEW.id, 'Hacking Begins',     start_ts + interval '30 minutes', start_ts + interval '60 minutes', null,                   null),
    (NEW.id, 'Submissions Close & Judging Starts', sub_close_ts,     sub_close_ts,                     'submission_deadline',  null),
    (NEW.id, 'Presentations',      end_ts - interval '30 minutes',   end_ts,                           null,                   null),
    (NEW.id, 'Awards Ceremony',    end_ts,                           end_ts + interval '30 minutes',   null,                   null)
  on conflict do nothing;

  return NEW;
end;
$$ language plpgsql;

update hackathon_schedule_items si
set linked_to = 'event_start',
    starts_at = h.starts_at,
    ends_at = case
      when si.ends_at is null then null
      else h.starts_at + (si.ends_at - si.starts_at)
    end,
    updated_at = now()
from hackathons h
where si.hackathon_id = h.id
  and si.trigger_type = 'challenge_release'
  and si.linked_to is null
  and h.starts_at is not null;
