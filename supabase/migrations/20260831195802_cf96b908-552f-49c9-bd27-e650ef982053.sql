ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_received_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS city text;

CREATE OR REPLACE FUNCTION public.bulk_insert_leads(_rows jsonb, _job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted INT := 0;
  dups INT := 0;
  total INT := 0;
  failed INT := 0;
  valid_cnt INT := 0;
  new_status UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id INTO new_status FROM public.lead_statuses WHERE is_default = true LIMIT 1;

  WITH src AS (
    SELECT NULLIF(TRIM(elem->>'name'),'') AS name,
           NULLIF(TRIM(elem->>'phone'),'') AS phone,
           NULLIF(TRIM(elem->>'email'),'') AS email,
           NULLIF(TRIM(elem->>'city'),'') AS city,
           CASE
             WHEN NULLIF(TRIM(elem->>'received_date'),'') IS NULL THEN CURRENT_DATE
             ELSE COALESCE((NULLIF(TRIM(elem->>'received_date'),''))::date, CURRENT_DATE)
           END AS received_date
    FROM jsonb_array_elements(_rows) AS elem
  ),
  valid AS (
    SELECT * FROM src WHERE name IS NOT NULL AND phone IS NOT NULL
  ),
  cnt AS (SELECT (SELECT COUNT(*) FROM src) AS c, (SELECT COUNT(*) FROM valid) AS v),
  ins AS (
    INSERT INTO public.leads (name, phone_number, email, city, lead_received_date, status_id)
    SELECT s.name, s.phone, s.email, s.city, s.received_date, new_status
    FROM valid s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.leads l WHERE l.phone_number = s.phone
    )
    RETURNING 1
  )
  SELECT (SELECT c FROM cnt), (SELECT v FROM cnt), (SELECT COUNT(*) FROM ins)
  INTO total, valid_cnt, inserted;

  failed := total - valid_cnt;
  dups := valid_cnt - inserted;

  UPDATE public.import_jobs
  SET processed_rows = processed_rows + total,
      inserted_rows = inserted_rows + inserted,
      duplicate_rows = duplicate_rows + dups,
      failed_rows = failed_rows + failed
  WHERE id = _job_id;

  RETURN jsonb_build_object('total', total, 'inserted', inserted, 'duplicates', dups, 'failed', failed);
END $function$;

REVOKE EXECUTE ON FUNCTION public.bulk_insert_leads(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_insert_leads(jsonb, uuid) TO authenticated;