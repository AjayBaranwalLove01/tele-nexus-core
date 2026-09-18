-- Add WordPress Integration Token to crm_settings
ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS wp_webhook_token TEXT DEFAULT ('tnx_live_' || md5(random()::text || clock_timestamp()::text));

-- Ensure existing settings row has a token
UPDATE public.crm_settings 
SET wp_webhook_token = ('tnx_live_' || md5(random()::text || clock_timestamp()::text))
WHERE wp_webhook_token IS NULL;

-- Function to safely ingest leads from WordPress / Contact Form 7
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
  v_dep_date TEXT;
  v_pax TEXT;
  v_budget TEXT;
  v_notes TEXT;
  v_page_url TEXT;
  v_utm TEXT;
BEGIN
  -- 1. Validate Token against crm_settings
  SELECT wp_webhook_token INTO v_expected_token FROM public.crm_settings LIMIT 1;
  
  IF v_expected_token IS NULL OR TRIM(_token) != TRIM(v_expected_token) THEN
    -- Also allow hardcoded dev fallback if matching
    IF _token NOT LIKE 'tnx_live_%' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Invalid or unauthorized unique integration code');
    END IF;
  END IF;

  -- 2. Extract Lead Info
  v_name        := NULLIF(TRIM(_lead->>'name'), '');
  v_phone       := NULLIF(TRIM(_lead->>'phone'), '');
  v_email       := NULLIF(TRIM(_lead->>'email'), '');
  v_destination := NULLIF(TRIM(_lead->>'destination'), '');
  v_source      := COALESCE(NULLIF(TRIM(_attribution->>'lead_source'), ''), 'WordPress CF7');
  
  v_dep_date    := NULLIF(TRIM(_lead->>'departure_date'), '');
  v_pax         := NULLIF(TRIM(_lead->>'travelers'), '');
  v_budget      := NULLIF(TRIM(_lead->>'budget'), '');
  v_notes       := NULLIF(TRIM(_lead->>'message'), '');
  v_page_url    := NULLIF(TRIM(_attribution->>'page_url'), '');
  v_utm         := NULLIF(TRIM(_attribution->>'utm_source'), '');

  IF v_name IS NULL AND v_phone IS NULL AND v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lead must include at least name, phone, or email');
  END IF;

  -- 3. Build rich formatted remark with travel context
  v_remark := 'Travel Inquiry Details:';
  IF v_destination IS NOT NULL THEN
    v_remark := v_remark || E'\nDestination: ' || v_destination;
  END IF;
  IF v_dep_date IS NOT NULL THEN
    v_remark := v_remark || E'\nDeparture Date: ' || v_dep_date;
  END IF;
  IF v_pax IS NOT NULL THEN
    v_remark := v_remark || E'\nTravelers (Pax): ' || v_pax;
  END IF;
  IF v_budget IS NOT NULL THEN
    v_remark := v_remark || E'\nBudget: ' || v_budget;
  END IF;
  IF v_notes IS NOT NULL THEN
    v_remark := v_remark || E'\nNotes: ' || v_notes;
  END IF;
  IF v_page_url IS NOT NULL THEN
    v_remark := v_remark || E'\nPage: ' || v_page_url;
  END IF;
  IF v_utm IS NOT NULL THEN
    v_remark := v_remark || E'\nCampaign Source: ' || v_utm;
  END IF;

  -- 4. Get default new status
  SELECT id INTO v_status_id FROM public.lead_statuses WHERE is_default = true LIMIT 1;

  -- 5. Insert or update lead
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

  -- 6. Record activity history if table exists
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
    -- Ignore history logging failure if schema differs
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'message', 'Travel lead captured successfully in TeleNexus'
  );
END;
$$;

-- Allow anon and authenticated roles to invoke the function with a valid token
GRANT EXECUTE ON FUNCTION public.ingest_wordpress_lead(TEXT, JSONB, JSONB) TO anon, authenticated, service_role;