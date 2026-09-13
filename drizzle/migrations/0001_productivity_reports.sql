-- Server-side aggregation for productivity reporting.
-- Admins see every telecaller; telecallers are forced to their own rows.

CREATE OR REPLACE FUNCTION public.productivity_daily(_from date, _to date, _telecaller uuid DEFAULT NULL)
RETURNS TABLE (
  activity_date date, telecaller_id uuid, telecaller_name text,
  unique_leads bigint, calls bigint, followups bigint, status_changes bigint,
  converted bigint, completed bigint, remarks bigint, activities bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _scope uuid;
BEGIN
  _scope := CASE WHEN public.is_admin(auth.uid()) THEN _telecaller ELSE auth.uid() END;
  RETURN QUERY
  SELECT h.activity_date,
         COALESCE(h.performed_by, h.telecaller_id) AS telecaller_id,
         COALESCE(h.performed_by_name, h.telecaller_name, 'Unknown') AS telecaller_name,
         COUNT(DISTINCT h.lead_id) AS unique_leads,
         COUNT(*) FILTER (WHERE h.activity_type IN ('call_logged','remark_added')) AS calls,
         COUNT(*) FILTER (WHERE h.activity_type = 'followup_set') AS followups,
         COUNT(*) FILTER (WHERE h.activity_type = 'status_changed') AS status_changes,
         COUNT(DISTINCT h.lead_id) FILTER (WHERE h.activity_type = 'status_changed' AND h.new_status ILIKE '%convert%') AS converted,
         COUNT(DISTINCT h.lead_id) FILTER (WHERE h.activity_type = 'completed') AS completed,
         COUNT(*) FILTER (WHERE h.activity_type = 'remark_added') AS remarks,
         COUNT(*) AS activities
  FROM public.lead_activity_history h
  WHERE h.activity_date BETWEEN _from AND _to
    AND h.activity_type IN ('call_logged','remark_added','status_changed','followup_set','completed','reopened','assigned','reassigned')
    AND COALESCE(h.performed_by, h.telecaller_id) IS NOT NULL
    AND (_scope IS NULL OR COALESCE(h.performed_by, h.telecaller_id) = _scope)
  GROUP BY 1,2,3
  ORDER BY 1 DESC, 3;
END $$;

CREATE OR REPLACE FUNCTION public.productivity_summary(_from date, _to date, _telecaller uuid DEFAULT NULL)
RETURNS TABLE (
  telecaller_id uuid, telecaller_name text, unique_leads bigint, calls bigint,
  followups bigint, status_changes bigint, converted bigint, completed bigint,
  activities bigint, currently_assigned bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _scope uuid;
BEGIN
  _scope := CASE WHEN public.is_admin(auth.uid()) THEN _telecaller ELSE auth.uid() END;
  RETURN QUERY
  WITH agg AS (
    SELECT COALESCE(h.performed_by, h.telecaller_id) AS tid,
           COALESCE(h.performed_by_name, h.telecaller_name, 'Unknown') AS tname,
           COUNT(DISTINCT h.lead_id) AS u,
           COUNT(*) FILTER (WHERE h.activity_type IN ('call_logged','remark_added')) AS c,
           COUNT(*) FILTER (WHERE h.activity_type = 'followup_set') AS f,
           COUNT(*) FILTER (WHERE h.activity_type = 'status_changed') AS sc,
           COUNT(DISTINCT h.lead_id) FILTER (WHERE h.activity_type = 'status_changed' AND h.new_status ILIKE '%convert%') AS cv,
           COUNT(DISTINCT h.lead_id) FILTER (WHERE h.activity_type = 'completed') AS cp,
           COUNT(*) AS a
    FROM public.lead_activity_history h
    WHERE h.activity_date BETWEEN _from AND _to
      AND h.activity_type IN ('call_logged','remark_added','status_changed','followup_set','completed','reopened','assigned','reassigned')
      AND COALESCE(h.performed_by, h.telecaller_id) IS NOT NULL
      AND (_scope IS NULL OR COALESCE(h.performed_by, h.telecaller_id) = _scope)
    GROUP BY 1,2
  )
  SELECT agg.tid, agg.tname, agg.u, agg.c, agg.f, agg.sc, agg.cv, agg.cp, agg.a,
         (SELECT COUNT(*) FROM public.leads l WHERE l.assigned_to = agg.tid)
  FROM agg ORDER BY agg.u DESC;
END $$;

CREATE OR REPLACE FUNCTION public.leads_worked(_from date, _to date, _telecaller uuid DEFAULT NULL)
RETURNS TABLE (
  lead_id bigint, name text, phone_number text, city text, current_status text,
  status_on_date text, assigned_name text, first_activity timestamptz,
  last_activity timestamptz, activity_count bigint, latest_remark text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _scope uuid;
BEGIN
  _scope := CASE WHEN public.is_admin(auth.uid()) THEN _telecaller ELSE auth.uid() END;
  RETURN QUERY
  WITH h AS (
    SELECT * FROM public.lead_activity_history x
    WHERE x.activity_date BETWEEN _from AND _to
      AND x.activity_type IN ('call_logged','remark_added','status_changed','followup_set','completed','reopened','assigned','reassigned')
      AND (_scope IS NULL OR COALESCE(x.performed_by, x.telecaller_id) = _scope)
  ), agg AS (
    SELECT h.lead_id AS lid, MIN(h.created_at) AS first_at, MAX(h.created_at) AS last_at, COUNT(*) AS cnt
    FROM h GROUP BY h.lead_id
  )
  SELECT l.id, l.name, l.phone_number, l.city, public.status_name(l.status_id),
    (SELECT h2.new_status FROM h h2 WHERE h2.lead_id = l.id AND h2.new_status IS NOT NULL ORDER BY h2.created_at DESC LIMIT 1),
    public.profile_name(l.assigned_to), agg.first_at, agg.last_at, agg.cnt,
    (SELECT h3.remarks FROM h h3 WHERE h3.lead_id = l.id AND h3.remarks IS NOT NULL ORDER BY h3.created_at DESC LIMIT 1)
  FROM agg JOIN public.leads l ON l.id = agg.lid
  ORDER BY agg.last_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.status_transitions(_from date, _to date, _telecaller uuid DEFAULT NULL)
RETURNS TABLE (previous_status text, new_status text, transitions bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _scope uuid;
BEGIN
  _scope := CASE WHEN public.is_admin(auth.uid()) THEN _telecaller ELSE auth.uid() END;
  RETURN QUERY
  SELECT COALESCE(h.previous_status, '—'), COALESCE(h.new_status, '—'), COUNT(*)
  FROM public.lead_activity_history h
  WHERE h.activity_type = 'status_changed'
    AND h.activity_date BETWEEN _from AND _to
    AND (_scope IS NULL OR COALESCE(h.performed_by, h.telecaller_id) = _scope)
  GROUP BY 1,2 ORDER BY 3 DESC;
END $$;

CREATE OR REPLACE FUNCTION public.lead_journey(_lead_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT (public.is_admin(auth.uid())
          OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = _lead_id AND l.assigned_to = auth.uid())
          OR EXISTS (SELECT 1 FROM public.lead_activity_history h WHERE h.lead_id = _lead_id AND h.performed_by = auth.uid())) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT jsonb_build_object(
    'created_at', (SELECT MIN(h.created_at) FROM public.lead_activity_history h WHERE h.lead_id = _lead_id),
    'first_assigned', (SELECT h.new_assigned_name FROM public.lead_activity_history h WHERE h.lead_id = _lead_id AND h.activity_type IN ('assigned','reassigned') ORDER BY h.created_at LIMIT 1),
    'first_activity', (SELECT MIN(h.created_at) FROM public.lead_activity_history h WHERE h.lead_id = _lead_id AND h.activity_type IN ('call_logged','remark_added','status_changed')),
    'last_activity', (SELECT MAX(h.created_at) FROM public.lead_activity_history h WHERE h.lead_id = _lead_id),
    'total_activities', (SELECT COUNT(*) FROM public.lead_activity_history h WHERE h.lead_id = _lead_id),
    'total_calls', (SELECT COUNT(*) FROM public.lead_activity_history h WHERE h.lead_id = _lead_id AND h.activity_type IN ('call_logged','remark_added')),
    'total_followups', (SELECT COUNT(*) FROM public.lead_activity_history h WHERE h.lead_id = _lead_id AND h.activity_type = 'followup_set'),
    'status_journey', (SELECT jsonb_agg(s ORDER BY ord) FROM (
        SELECT h.new_status AS s, h.created_at AS ord FROM public.lead_activity_history h
        WHERE h.lead_id = _lead_id AND h.activity_type IN ('lead_created','status_changed') AND h.new_status IS NOT NULL
      ) q),
    'telecallers', (SELECT jsonb_agg(DISTINCT h.telecaller_name) FROM public.lead_activity_history h WHERE h.lead_id = _lead_id AND h.telecaller_name IS NOT NULL),
    'final_status', (SELECT public.status_name(l.status_id) FROM public.leads l WHERE l.id = _lead_id),
    'final_telecaller', (SELECT public.profile_name(l.assigned_to) FROM public.leads l WHERE l.id = _lead_id)
  ) INTO result;
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.productivity_daily(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.productivity_summary(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leads_worked(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.status_transitions(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_journey(bigint) TO authenticated;