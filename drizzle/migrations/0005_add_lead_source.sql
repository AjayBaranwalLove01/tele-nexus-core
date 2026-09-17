ALTER TABLE public.leads ADD COLUMN source text;
UPDATE public.leads SET source = 'Old Google Lead' WHERE source IS NULL;
CREATE INDEX IF NOT EXISTS leads_source_idx ON public.leads (source);

ALTER TABLE public.lead_archive ADD COLUMN source text;
UPDATE public.lead_archive SET source = 'Old Google Lead' WHERE source IS NULL;

CREATE OR REPLACE FUNCTION public.archive_leads(_ids bigint[], _reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  actor_name text := public.profile_name(auth.uid());
  archived int := 0;
  r RECORD;
BEGIN
  IF NOT public.is_admin(actor) THEN RAISE EXCEPTION 'Only admins can archive leads'; END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('archived', 0, 'requested', 0);
  END IF;

  FOR r IN
    SELECT * FROM public.leads
    WHERE id = ANY(_ids) AND archived_at IS NULL
    FOR UPDATE
  LOOP
    INSERT INTO public.lead_archive(
      lead_id, name, phone_number, email, city, source, status_id, status_name, temperature_name,
      assigned_to, assigned_name, lead_received_date, call_date, follow_up_date, follow_up_time,
      remarks_count, last_remark, lead_created_at, lead_updated_at, snapshot,
      archive_reason, archived_by, archived_by_name)
    VALUES (
      r.id, r.name, r.phone_number, r.email, r.city, r.source, r.status_id,
      public.status_name(r.status_id),
      (SELECT t.name FROM public.lead_temperatures t WHERE t.id = r.temperature_id),
      r.assigned_to, public.profile_name(r.assigned_to), r.lead_received_date, r.call_date,
      r.follow_up_date, r.follow_up_time, r.remarks_count, r.last_remark,
      r.created_at, r.updated_at,
      jsonb_build_object(
        'lead', to_jsonb(r),
        'remarks', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
                             FROM public.lead_remarks x WHERE x.lead_id = r.id), '[]'::jsonb),
        'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at)
                             FROM public.lead_activity_history h WHERE h.lead_id = r.id), '[]'::jsonb)
      ),
      NULLIF(TRIM(COALESCE(_reason, '')), ''), actor, actor_name);

    UPDATE public.leads
    SET archived_at = now(), archived_by = actor,
        archive_reason = NULLIF(TRIM(COALESCE(_reason, '')), ''), updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, meta)
    VALUES (actor, 'lead_archived', 'lead', r.id::text,
            jsonb_build_object('phone', r.phone_number, 'previous_status', public.status_name(r.status_id),
                               'assigned_to', public.profile_name(r.assigned_to),
                               'reason', NULLIF(TRIM(COALESCE(_reason, '')), '')));
    archived := archived + 1;
  END LOOP;

  RETURN jsonb_build_object('archived', archived, 'requested', COALESCE(array_length(_ids,1),0));
END $function$;

GRANT EXECUTE ON FUNCTION public.archive_leads(bigint[], text) TO authenticated;