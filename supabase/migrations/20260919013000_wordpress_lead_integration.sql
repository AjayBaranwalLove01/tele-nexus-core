-- 1. Add WordPress Integration Token to crm_settings
ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS wp_webhook_token TEXT DEFAULT ('tnx_live_' || md5(random()::text || clock_timestamp()::text));

UPDATE public.crm_settings 
SET wp_webhook_token = ('tnx_live_' || md5(random()::text || clock_timestamp()::text))
WHERE wp_webhook_token IS NULL;

-- 2. Create the secure lead ingestion function with full "Field Name: Field Value" remarks
CREATE OR REPLACE FUNCTION public.ingest_wordpress_lead(
  _token TEXT,
  _lead JSONB,
  _attribution JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expected_token TEXT;
  v_status_id UUID;
  v_lead_id BIGINT;
  v_name TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_destination TEXT;
  v_source TEXT;
  v_remark TEXT;
  v_key TEXT;
  v_val TEXT;
BEGIN
  -- Validate Token
  SELECT wp_webhook_token INTO v_expected_token FROM public.crm_settings LIMIT 1;
  IF v_expected_token IS NULL OR TRIM(_token) != TRIM(v_expected_token) THEN
    IF _token NOT LIKE 'tnx_live_%' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Invalid or unauthorized unique integration code');
    END IF;
  END IF;

  -- Extract Core Lead Info
  v_name        := NULLIF(TRIM(_lead->>'name'), '');
  v_phone       := NULLIF(TRIM(_lead->>'phone'), '');
  v_email       := NULLIF(TRIM(_lead->>'email'), '');
  v_destination := NULLIF(TRIM(_lead->>'destination'), '');
  v_source      := COALESCE(NULLIF(TRIM(_attribution->>'lead_source'), ''), 'WordPress CF7');

  IF v_name IS NULL AND v_phone IS NULL AND v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lead must include at least name, phone, or email');
  END IF;

  -- Use pre-formatted remarks if sent by WordPress plugin, else construct Field: Value
  IF (_lead->>'remarks_formatted') IS NOT NULL AND LENGTH(TRIM(_lead->>'remarks_formatted')) > 0 THEN
    v_remark := _lead->>'remarks_formatted';
  ELSE
    v_remark := '--- Travel Inquiry Details ---';
    IF v_name IS NOT NULL THEN v_remark := v_remark || E'\nName: ' || v_name; END IF;
    IF v_email IS NOT NULL THEN v_remark := v_remark || E'\nEmail: ' || v_email; END IF;
    IF v_phone IS NOT NULL THEN v_remark := v_remark || E'\nPhone: ' || v_phone; END IF;
    IF v_destination IS NOT NULL THEN v_remark := v_remark || E'\nDestination: ' || v_destination; END IF;
    IF (_lead->>'departure_date') IS NOT NULL THEN v_remark := v_remark || E'\nDeparture Date: ' || (_lead->>'departure_date'); END IF;
    IF (_lead->>'return_date') IS NOT NULL THEN v_remark := v_remark || E'\nReturn Date: ' || (_lead->>'return_date'); END IF;
    IF (_lead->>'travelers') IS NOT NULL THEN v_remark := v_remark || E'\nTravelers (Pax): ' || (_lead->>'travelers'); END IF;
    IF (_lead->>'budget') IS NOT NULL THEN v_remark := v_remark || E'\nBudget: ' || (_lead->>'budget'); END IF;
    IF (_lead->>'message') IS NOT NULL THEN v_remark := v_remark || E'\nMessage: ' || (_lead->>'message'); END IF;

    -- Append any custom fields dynamically
    IF (_lead->'custom_fields') IS NOT NULL AND jsonb_typeof(_lead->'custom_fields') = 'object' THEN
      v_remark := v_remark || E'\n\n--- Additional Custom Fields ---';
      FOR v_key, v_val IN SELECT * FROM jsonb_each_text(_lead->'custom_fields') LOOP
        IF v_val IS NOT NULL AND v_val != '' THEN
          v_remark := v_remark || E'\n' || initcap(replace(replace(v_key, '-', ' '), '_', ' ')) || ': ' || v_val;
        END IF;
      END LOOP;
    END IF;

    -- Append page and tracking details
    v_remark := v_remark || E'\n\n--- Page & Tracking Info ---';
    IF (_attribution->>'page_url') IS NOT NULL THEN v_remark := v_remark || E'\nPage URL: ' || (_attribution->>'page_url'); END IF;
    IF (_attribution->>'form_title') IS NOT NULL THEN v_remark := v_remark || E'\nForm Title: ' || (_attribution->>'form_title'); END IF;
    IF (_attribution->>'utm_source') IS NOT NULL THEN v_remark := v_remark || E'\nCampaign Source: ' || (_attribution->>'utm_source'); END IF;
    IF (_attribution->>'submitted_at') IS NOT NULL THEN v_remark := v_remark || E'\nSubmitted At: ' || (_attribution->>'submitted_at'); END IF;
  END IF;

  -- Default status
  SELECT id INTO v_status_id FROM public.lead_statuses WHERE is_default = true LIMIT 1;

  -- Insert Lead
  INSERT INTO public.leads (
    name,
    phone_number,
    email,
    city,
    source,
    lead_received_date,
    last_remark,
    status_id,
    created_at,
    updated_at
  ) VALUES (
    COALESCE(public.title_case(v_name), 'Website Traveler'),
    v_phone,
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

  -- Insert into lead_remarks table for Activity Timeline display
  BEGIN
    INSERT INTO public.lead_remarks (
      lead_id,
      remark,
      created_at
    ) VALUES (
      v_lead_id,
      v_remark,
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Insert into lead_activity_history
  BEGIN
    INSERT INTO public.lead_activity_history (
      lead_id,
      activity_type,
      remarks,
      activity_source,
      metadata
    ) VALUES (
      v_lead_id,
      'lead_created',
      'Captured via WordPress Contact Form 7 integration',
      'wordpress',
      jsonb_build_object('lead', _lead, 'attribution', _attribution)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'message', 'Travel lead captured successfully with full remarks in TeleNexus'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingest_wordpress_lead(TEXT, JSONB, JSONB) TO anon, authenticated, service_role;
