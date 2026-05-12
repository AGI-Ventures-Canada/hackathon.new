alter table hackathon_notification_settings
  add column if not exists email_on_challenges_released boolean not null default true;
