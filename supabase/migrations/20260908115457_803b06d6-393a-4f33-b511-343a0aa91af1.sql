CREATE OR REPLACE FUNCTION public.assign_leads_by_ids(_telecaller uuid, _ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  matched INT := 0;
  new_status UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id INTO new_status FROM public.lead_statuses WHERE is_default = true LIMIT 1;

  WITH upd AS (
    UPDATE public.leads l
    SET assigned_to = _telecaller,
        assigned_at = now(),
        status_id = COALESCE(l.status_id, new_status),
        updated_at = now()
    WHERE l.id = ANY(_ids)
      AND l.completed_at IS NULL
    RETURNING l.id
  )
  SELECT COUNT(*) INTO matched FROM upd;

  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'assign_by_ids', 'telecaller', _telecaller::text,
          jsonb_build_object('matched', matched, 'requested', COALESCE(array_length(_ids,1),0)));

  RETURN jsonb_build_object('matched', matched, 'requested', COALESCE(array_length(_ids,1),0));
END $function$;