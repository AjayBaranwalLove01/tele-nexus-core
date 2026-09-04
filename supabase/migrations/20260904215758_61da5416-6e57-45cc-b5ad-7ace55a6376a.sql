
INSERT INTO public.lead_statuses (name, is_completion, sort_order, is_default)
SELECT * FROM (VALUES
  ('New', false, 1, true),
  ('Contacted', false, 2, false),
  ('Interested', false, 3, false),
  ('Follow Up', false, 4, false),
  ('Callback', false, 5, false),
  ('Not Interested', true, 6, false),
  ('Converted', true, 7, false)
) AS v(name, is_completion, sort_order, is_default)
WHERE NOT EXISTS (SELECT 1 FROM public.lead_statuses);

INSERT INTO public.lead_temperatures (name, color, sort_order)
SELECT * FROM (VALUES
  ('Hot', 'red', 1),
  ('Warm', 'amber', 2),
  ('Cold', 'blue', 3)
) AS v(name, color, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.lead_temperatures);

UPDATE public.leads SET status_id = (SELECT id FROM public.lead_statuses WHERE is_default LIMIT 1)
WHERE status_id IS NULL;

CREATE OR REPLACE FUNCTION public.assign_leads_by_phone(_telecaller uuid, _phones text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  matched INT := 0;
  new_status UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id INTO new_status FROM public.lead_statuses WHERE is_default = true LIMIT 1;

  WITH norm AS (
    SELECT DISTINCT regexp_replace(p, '\D', '', 'g') AS digits
    FROM unnest(_phones) AS p
    WHERE regexp_replace(p, '\D', '', 'g') <> ''
  ),
  upd AS (
    UPDATE public.leads l
    SET assigned_to = _telecaller,
        assigned_at = now(),
        status_id = COALESCE(l.status_id, new_status),
        updated_at = now()
    FROM norm n
    WHERE regexp_replace(COALESCE(l.phone_number,''), '\D', '', 'g') = n.digits
    RETURNING l.id
  )
  SELECT COUNT(*) INTO matched FROM upd;

  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'assign_by_phone', 'telecaller', _telecaller::text,
          jsonb_build_object('matched', matched, 'requested', array_length(_phones,1)));

  RETURN jsonb_build_object('matched', matched, 'requested', COALESCE(array_length(_phones,1),0));
END $$;

REVOKE ALL ON FUNCTION public.assign_leads_by_phone(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_leads_by_phone(uuid, text[]) TO authenticated;
