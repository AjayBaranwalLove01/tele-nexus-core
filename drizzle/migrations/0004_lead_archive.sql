-- 1. Archive flags on leads (additive, nullable)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_by uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archive_reason text;
CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON public.leads(archived_at);

-- 2. Archive record table (snapshot + audit of every archive operation)
CREATE TABLE IF NOT EXISTS public.lead_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  name text,
  phone_number text,
  email text,
  city text,
  status_id uuid,
  status_name text,
  temperature_name text,
  assigned_to uuid,
  assigned_name text,
  lead_received_date date,
  call_date date,
  follow_up_date date,
  follow_up_time time,
  remarks_count integer NOT NULL DEFAULT 0,
  last_remark text,
  lead_created_at timestamptz,
  lead_updated_at timestamptz,
  snapshot jsonb,
  archive_reason text,
  archived_by uuid,
  archived_by_name text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  restored_by uuid,
  restored_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_archive_lead ON public.lead_archive(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_archive_archived_at ON public.lead_archive(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_archive_phone ON public.lead_archive(phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_archive_active ON public.lead_archive(lead_id) WHERE restored_at IS NULL;

GRANT SELECT ON public.lead_archive TO authenticated;
GRANT ALL ON public.lead_archive TO service_role;

ALTER TABLE public.lead_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads archive" ON public.lead_archive;
CREATE POLICY "Admin reads archive" ON public.lead_archive
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 3. Hide archived leads from non-admin users at the RLS level
DROP POLICY IF EXISTS "Telecaller sees own, admin sees all" ON public.leads;
CREATE POLICY "Telecaller sees own, admin sees all" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR (assigned_to = auth.uid() AND archived_at IS NULL));

DROP POLICY IF EXISTS "Telecaller updates own, admin updates all" ON public.leads;
CREATE POLICY "Telecaller updates own, admin updates all" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR (assigned_to = auth.uid() AND archived_at IS NULL))
  WITH CHECK (public.is_admin(auth.uid()) OR (assigned_to = auth.uid() AND archived_at IS NULL));

-- 4. Never auto-assign archived leads
CREATE OR REPLACE FUNCTION public.assign_leads_to_telecaller(_telecaller uuid, _count integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  new_status UUID;
  assigned_count INT;
BEGIN
  SELECT id INTO new_status FROM public.lead_statuses WHERE is_default = true LIMIT 1;

  WITH picked AS (
    SELECT id FROM public.leads
    WHERE assigned_to IS NULL AND archived_at IS NULL
    ORDER BY id
    LIMIT _count
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.leads l
    SET assigned_to = _telecaller,
        assigned_at = now(),
        status_id = COALESCE(l.status_id, new_status),
        updated_at = now()
    FROM picked WHERE l.id = picked.id
    RETURNING l.id
  )
  SELECT COUNT(*) INTO assigned_count FROM updated;

  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'assign_batch', 'telecaller', _telecaller::text,
          jsonb_build_object('count', assigned_count));

  RETURN assigned_count;
END $function$;

CREATE OR REPLACE FUNCTION public.assign_leads_by_ids(_telecaller uuid, _ids bigint[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
      AND l.archived_at IS NULL
    RETURNING l.id
  )
  SELECT COUNT(*) INTO matched FROM upd;

  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'assign_by_ids', 'telecaller', _telecaller::text,
          jsonb_build_object('matched', matched, 'requested', COALESCE(array_length(_ids,1),0)));

  RETURN jsonb_build_object('matched', matched, 'requested', COALESCE(array_length(_ids,1),0));
END $function$;

-- 5. Manual archive (transactional, admin only)
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
      lead_id, name, phone_number, email, city, status_id, status_name, temperature_name,
      assigned_to, assigned_name, lead_received_date, call_date, follow_up_date, follow_up_time,
      remarks_count, last_remark, lead_created_at, lead_updated_at, snapshot,
      archive_reason, archived_by, archived_by_name)
    VALUES (
      r.id, r.name, r.phone_number, r.email, r.city, r.status_id,
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

-- 6. Restore from archive (transactional, admin only)
CREATE OR REPLACE FUNCTION public.restore_leads(_ids bigint[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  actor_name text := public.profile_name(auth.uid());
  restored int := 0;
  r RECORD;
BEGIN
  IF NOT public.is_admin(actor) THEN RAISE EXCEPTION 'Only admins can restore leads'; END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('restored', 0, 'requested', 0);
  END IF;

  FOR r IN
    SELECT * FROM public.leads
    WHERE id = ANY(_ids) AND archived_at IS NOT NULL
    FOR UPDATE
  LOOP
    UPDATE public.lead_archive
    SET restored_at = now(), restored_by = actor, restored_by_name = actor_name
    WHERE lead_id = r.id AND restored_at IS NULL;

    UPDATE public.leads
    SET archived_at = NULL, archived_by = NULL, archive_reason = NULL, updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, meta)
    VALUES (actor, 'lead_restored', 'lead', r.id::text,
            jsonb_build_object('phone', r.phone_number, 'status', public.status_name(r.status_id)));
    restored := restored + 1;
  END LOOP;

  RETURN jsonb_build_object('restored', restored, 'requested', COALESCE(array_length(_ids,1),0));
END $function$;

GRANT EXECUTE ON FUNCTION public.archive_leads(bigint[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_leads(bigint[]) TO authenticated;