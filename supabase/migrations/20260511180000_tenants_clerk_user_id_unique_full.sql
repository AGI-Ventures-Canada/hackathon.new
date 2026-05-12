DROP INDEX IF EXISTS idx_tenants_clerk_user_id;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_clerk_user_id_key UNIQUE (clerk_user_id);
