alter table hackathon_schedule_items
  drop constraint if exists hackathon_schedule_items_linked_to_check;

alter table hackathon_schedule_items
  add constraint hackathon_schedule_items_linked_to_check
  check (linked_to in ('event_start', 'event_end', 'event_publish'));

comment on column hackathon_schedule_items.linked_to is
  'When set, this item''s starts_at is kept in sync with the hackathon''s starts_at or ends_at. event_publish is a status-only link (no time sync) — challenge release fires when the hackathon transitions to published.';
