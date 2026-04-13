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

  -- Default: 1 hour before event ends. If event is shorter than 1 hour, use event end time.
  if (end_ts - start_ts) >= interval '1 hour' then
    sub_close_ts := end_ts - interval '60 minutes';
  else
    sub_close_ts := end_ts;
  end if;

  insert into hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type)
  values
    (NEW.id, 'Opening Kickoff',    start_ts,                    start_ts + interval '30 minutes', null),
    (NEW.id, 'Challenge Release',  start_ts,                    start_ts,                         'challenge_release'),
    (NEW.id, 'Hacking Begins',     start_ts + interval '30 minutes', start_ts + interval '60 minutes', null),
    (NEW.id, 'Submissions Close & Judging Starts', sub_close_ts, sub_close_ts, 'submission_deadline'),
    (NEW.id, 'Presentations',      end_ts - interval '30 minutes',   end_ts,                           null),
    (NEW.id, 'Awards Ceremony',    end_ts,                           end_ts + interval '30 minutes',   null)
  on conflict do nothing;

  return NEW;
end;
$$ language plpgsql;

comment on function seed_default_agenda_items() is
  'Auto-creates 6 default agenda items when a hackathon is inserted. Derives times from starts_at/ends_at with fallback defaults. Submission deadline defaults to 1hr before event end, or event end if event is shorter than 1hr.';
