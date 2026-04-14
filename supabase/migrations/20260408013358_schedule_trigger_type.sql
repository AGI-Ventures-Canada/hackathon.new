alter table hackathon_schedule_items
  add column trigger_type text
  check (trigger_type in ('challenge_release', 'submission_deadline'));

create unique index idx_schedule_items_trigger_unique
  on hackathon_schedule_items (hackathon_id, trigger_type)
  where trigger_type is not null;

comment on column hackathon_schedule_items.trigger_type is
  'Optional system trigger linked to this agenda item. Only one item per trigger_type per hackathon.';
