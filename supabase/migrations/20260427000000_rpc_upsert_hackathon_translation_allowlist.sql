CREATE OR REPLACE FUNCTION upsert_hackathon_translation(
  p_hackathon_id uuid,
  p_tenant_id uuid,
  p_locale text,
  p_fields jsonb
)
RETURNS SETOF hackathons
LANGUAGE plpgsql
AS $$
DECLARE
  v_translations jsonb;
  v_per_locale jsonb;
  v_key text;
  v_value text;
  v_allowed_keys CONSTANT text[] := ARRAY['name', 'description', 'rules', 'location_name', 'community_label'];
BEGIN
  SELECT COALESCE(translations, '{}'::jsonb) INTO v_translations
  FROM hackathons
  WHERE id = p_hackathon_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_per_locale := COALESCE(v_translations -> p_locale, '{}'::jsonb);

  FOR v_key, v_value IN
    SELECT key, value FROM jsonb_each_text(p_fields)
  LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      CONTINUE;
    END IF;
    IF v_value IS NULL OR btrim(v_value) = '' THEN
      v_per_locale := v_per_locale - v_key;
    ELSE
      v_per_locale := jsonb_set(v_per_locale, ARRAY[v_key], to_jsonb(btrim(v_value)));
    END IF;
  END LOOP;

  IF v_per_locale = '{}'::jsonb THEN
    v_translations := v_translations - p_locale;
  ELSE
    v_translations := jsonb_set(v_translations, ARRAY[p_locale], v_per_locale);
  END IF;

  RETURN QUERY
  UPDATE hackathons
  SET translations = CASE WHEN v_translations = '{}'::jsonb THEN NULL ELSE v_translations END
  WHERE id = p_hackathon_id AND tenant_id = p_tenant_id
  RETURNING *;
END;
$$;
