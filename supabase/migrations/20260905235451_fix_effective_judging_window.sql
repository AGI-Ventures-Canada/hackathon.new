CREATE OR REPLACE FUNCTION public.judging_window_is_open(p_hackathon_id uuid, p_round_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN h.effective_status::text NOT IN ('active','judging') OR h.results_published_at IS NOT NULL THEN false
    WHEN p_round_id IS NOT NULL AND (r.id IS NULL OR r.status::text <> 'active') THEN false
    WHEN coalesce(r.opens_at,h.judging_opens_at) IS NULL AND coalesce(r.closes_at,h.judging_closes_at) IS NULL
      THEN h.effective_status::text = 'judging' OR coalesce(h.phase::text IN ('preliminaries','finals'),false) OR coalesce(r.status::text = 'active',false)
    ELSE now() >= coalesce(r.opens_at,h.judging_opens_at) AND now() < coalesce(r.closes_at,h.judging_closes_at)
  END
  FROM (
    SELECT event.*, public.effective_hackathon_status(event.status,event.starts_at,event.ends_at) AS effective_status
    FROM public.hackathons event WHERE event.id = p_hackathon_id
  ) h
  LEFT JOIN public.judging_rounds r ON r.id = p_round_id AND r.hackathon_id = h.id;
$$;
REVOKE ALL ON FUNCTION public.judging_window_is_open(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.judging_window_is_open(uuid,uuid) TO service_role;
