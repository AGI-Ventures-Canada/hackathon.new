CREATE UNIQUE INDEX udx_judges_display_clerk_user
  ON hackathon_judges_display (hackathon_id, clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

CREATE UNIQUE INDEX udx_judges_display_name_manual
  ON hackathon_judges_display (hackathon_id, name)
  WHERE clerk_user_id IS NULL;
