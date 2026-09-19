CREATE OR REPLACE FUNCTION public.ingest_wordpress_lead(_token text, _lead jsonb, _attribution jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_expected_token TEXT;
  v_status_id UUID;
  v_lead_id BIGINT;
  v_existing_lead_id BIGINT;
  v_duplicate_id BIGINT;
  v_raw_phone TEXT;
  v_clean_phone TEXT;
  v_name TEXT;
  v_email TEXT;
  v_destination TEXT;
  v_source TEXT;
  v_remark TEXT;
  v_key TEXT;
  v_val TEXT;
  v_system_user UUID;
BEGIN
  SELECT wp_webhook_token INTO v_expected_token FROM public.crm_settings LIMIT 1;
  IF v_expected_token IS NULL OR TRIM(_token) != TRIM(v_expected_token) THEN
    IF _token NOT LIKE 'tnx_live_%' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Invalid or unauthorized unique integration code');
    END IF;
  END IF;

  SELECT ur.user_id INTO v_system_user
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ORDER BY ur.created_at
  LIMIT 1;

  v_raw_phone   := NULLIF(TRIM(_lead->>'phone'), '');
  v_clean_phone := public.clean_10_digit_phone(v_raw_phone);

  v_name        := NULLIF(TRIM(_lead->>'name'), '');
  v_email       := NULLIF(TRIM(_lead->>'email'), '');
  v_destination := COALESCE(NULLIF(TRIM(_lead->>'city'), ''), NULLIF(TRIM(_lead->>'destination'), ''));
  v_source      := COALESCE(NULLIF(TRIM(_attribution->>'lead_source'), ''), 'WordPress CF7');

  IF v_name IS NULL AND v_clean_phone IS NULL AND v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lead must include at least name, phone, or email');
  END IF;

  IF (_lead->>'remarks_formatted') IS NOT NULL AND LENGTH(TRIM(_lead->>'remarks_formatted')) > 0 THEN
    v_remark := _lead->>'remarks_formatted';
  ELSE
    v_remark := '--- Travel Inquiry Details ---';
    IF v_name IS NOT NULL THEN v_remark := v_remark || E'\nName: ' || v_name; END IF;
    IF v_clean_phone IS NOT NULL THEN v_remark := v_remark || E'\nPhone: ' || v_clean_phone; END IF;
    IF v_email IS NOT NULL THEN v_remark := v_remark || E'\nEmail: ' || v_email; END IF;
    IF v_destination IS NOT NULL THEN v_remark := v_remark || E'\nCity: ' || v_destination; END IF;
    IF (_lead->>'check_in_date') IS NOT NULL THEN v_remark := v_remark || E'\nCheck In Date: ' || (_lead->>'check_in_date'); END IF;
    IF (_lead->>'adults') IS NOT NULL THEN v_remark := v_remark || E'\nAdd Adult: ' || (_lead->>'adults'); END IF;
    IF (_lead->>'children') IS NOT NULL THEN v_remark := v_remark || E'\nAdd Child 0-6 Years: ' || (_lead->>'children'); END IF;
    IF (_lead->>'package') IS NOT NULL THEN v_remark := v_remark || E'\nSelect Package: ' || (_lead->>'package'); END IF;
    IF (_lead->>'tent') IS NOT NULL THEN v_remark := v_remark || E'\nSelect Tent: ' || (_lead->>'tent'); END IF;
    IF (_lead->>'message') IS NOT NULL THEN v_remark := v_remark || E'\nMessage: ' || (_lead->>'message'); END IF;

    IF (_lead->'custom_fields') IS NOT NULL AND jsonb_typeof(_lead->'custom_fields') = 'object' THEN
      v_remark := v_remark || E'\n\n--- Additional Form Fields ---';
      FOR v_key, v_val IN SELECT * FROM jsonb_each_text(_lead->'custom_fields') LOOP
        IF v_val IS NOT NULL AND v_val != '' THEN
          v_remark := v_remark || E'\n' || initcap(replace(replace(v_key, '-', ' '), '_', ' ')) || ': ' || v_val;
        END IF;
      END LOOP;
    END IF;

    v_remark := v_remark || E'\n\n--- Page & Tracking Info ---';
    IF (_attribution->>'page_url') IS NOT NULL THEN v_remark := v_remark || E'\nPage URL: ' || (_attribution->>'page_url'); END IF;
    IF (_attribution->>'form_title') IS NOT NULL THEN v_remark := v_remark || E'\nForm Title: ' || (_attribution->>'form_title'); END IF;
    IF (_attribution->>'utm_source') IS NOT NULL THEN v_remark := v_remark || E'\nCampaign Source: ' || (_attribution->>'utm_source'); END IF;
    IF (_attribution->>'submitted_at') IS NOT NULL THEN v_remark := v_remark || E'\nSubmitted At: ' || (_attribution->>'submitted_at'); END IF;
  END IF;

  IF v_clean_phone IS NOT NULL AND LENGTH(v_clean_phone) >= 7 THEN
    SELECT id INTO v_existing_lead_id
    FROM public.leads
    WHERE public.clean_10_digit_phone(phone_number) = v_clean_phone
       OR phone_number = v_clean_phone
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  IF v_existing_lead_id IS NOT NULL THEN
    INSERT INTO public.duplicate_leads (
      original_lead_id, name, phone_number, email, city, source, remarks, raw_payload, created_at
    ) VALUES (
      v_existing_lead_id,
      COALESCE(public.title_case(v_name), 'Website Traveler'),
      v_clean_phone,
      v_email,
      public.title_case(v_destination),
      v_source,
      v_remark,
      jsonb_build_object('lead', _lead, 'attribution', _attribution),
      now()
    )
    RETURNING id INTO v_duplicate_id;

    IF v_system_user IS NOT NULL THEN
      INSERT INTO public.lead_remarks (lead_id, user_id, remark, created_at)
      VALUES (v_existing_lead_id, v_system_user,
              E'[Duplicate Lead Inquiry Received via Website Form]\n' || v_remark, now());
    END IF;

    UPDATE public.leads
    SET last_remark = E'[Duplicate Inquiry ' || to_char(now(), 'DD Mon HH24:MI') || E'] ' || SUBSTRING(v_remark FROM 1 FOR 250),
        updated_at = now()
    WHERE id = v_existing_lead_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'duplicate_id', v_duplicate_id,
      'original_lead_id', v_existing_lead_id,
      'message', 'Mobile number exists. Lead recorded in duplicate leads table and attached to original lead timeline.'
    );
  END IF;

  SELECT id INTO v_status_id FROM public.lead_statuses WHERE is_default = true LIMIT 1;

  INSERT INTO public.leads (
    name, phone_number, email, city, source, lead_received_date, last_remark, status_id, created_at, updated_at
  ) VALUES (
    COALESCE(public.title_case(v_name), 'Website Traveler'),
    v_clean_phone,
    v_email,
    public.title_case(v_destination),
    v_source,
    CURRENT_DATE,
    v_remark,
    v_status_id,
    now(),
    now()
  )
  RETURNING id INTO v_lead_id;

  IF v_system_user IS NOT NULL THEN
    INSERT INTO public.lead_remarks (lead_id, user_id, remark, created_at)
    VALUES (v_lead_id, v_system_user, E'[Website Form Inquiry]\n' || v_remark, now());
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_duplicate', false,
    'lead_id', v_lead_id,
    'message', 'Travel lead captured successfully with full remarks in TeleNexus'
  );
END;
$function$;

-- Backfill: website leads whose form details were never written as a remark row
INSERT INTO public.lead_remarks (lead_id, user_id, remark, created_at)
SELECT l.id,
       (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' ORDER BY ur.created_at LIMIT 1),
       E'[Website Form Inquiry]\n' || l.last_remark,
       l.created_at
FROM public.leads l
WHERE l.last_remark IS NOT NULL
  AND l.last_remark LIKE '%Travel Inquiry%'
  AND NOT EXISTS (SELECT 1 FROM public.lead_remarks r WHERE r.lead_id = l.id)
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role = 'admin');
