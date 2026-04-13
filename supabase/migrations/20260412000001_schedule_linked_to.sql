alter table hackathon_schedule_items
  add column linked_to text
  check (linked_to in ('event_start', 'event_end'));

comment on column hackathon_schedule_items.linked_to is
  'When set, this item''s starts_at is kept in sync with the hackathon''s starts_at or ends_at.';

create or replace function propagate_linked_schedule_times()
returns trigger
language plpgsql
as $$
begin
  if NEW.starts_at is distinct from OLD.starts_at then
    update hackathon_schedule_items
    set starts_at = NEW.starts_at, updated_at = now()
    where hackathon_id = NEW.id
      and linked_to = 'event_start';
  end if;

  if NEW.ends_at is distinct from OLD.ends_at then
    update hackathon_schedule_items
    set starts_at = NEW.ends_at, updated_at = now()
    where hackathon_id = NEW.id
      and linked_to = 'event_end';
  end if;

  return NEW;
end;
$$;

create trigger trg_propagate_linked_schedule_times
  after update of starts_at, ends_at on hackathons
  for each row
  execute function propagate_linked_schedule_times();
