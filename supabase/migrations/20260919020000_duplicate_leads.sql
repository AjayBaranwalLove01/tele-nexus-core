-- 1. Helper function to normalize any phone number to strict 10 digits
CREATE OR REPLACE FUNCTION public.clean_10_digit_phone(_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $func$
DECLARE
  v_digits text;
BEGIN
  IF _phone IS NULL OR TRIM(_phone) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-digit characters
  v_digits := regexp_replace(_phone, '\D', '', 'g');
  
  -- If 12 digits and starts with 91 (India country code), strip 91
  IF length(v_digits) = 12 AND v_digits LIKE '91%' THEN
    v_digits := substr(v_digits, 3);
  END IF;
  
  -- Strip all leading zeroes
  v_digits := ltrim(v_digits, '0');
  
  -- If longer than 10 digits, keep the last 10 digits
  IF length(v_digits) > 10 THEN
    v_digits := right(v_digits, 10);
  END IF;
  
  RETURN NULLIF(v_digits, '');
END;
$func$;

-- 2. Create duplicate_leads table
CREATE TABLE IF NOT EXISTS public.duplicate_leads (
  id BIGSERIAL PRIMARY KEY,
  original_lead_id BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
  name TEXT,
  phone_number TEXT NOT NULL,
  email TEXT,
  city TEXT,
  source TEXT,
  remarks TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_duplicate_leads_phone ON public.duplicate_leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_duplicate_leads_original_id ON public.duplicate_leads(original_lead_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_leads_created_at ON public.duplicate_leads(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.duplicate_leads ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies
DROP POLICY IF EXISTS "authenticated_all_duplicate_leads" ON public.duplicate_leads;
CREATE POLICY "authenticated_all_duplicate_leads" ON public.duplicate_leads
  FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_duplicate_leads" ON public.duplicate_leads;
CREATE POLICY "anon_insert_duplicate_leads" ON public.duplicate_leads
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_duplicate_leads" ON public.duplicate_leads;
CREATE POLICY "service_role_all_duplicate_leads" ON public.duplicate_leads
  FOR ALL TO service_role USING (true);

-- 3. Update ingest_wordpress_lead function with duplicate detection
CREATE OR REPLACE FUNCTION public.ingest_wordpress_lead(
  _token TEXT,
  _lead JSONB,
  _attribution JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
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
BEGIN
  -- Validate Token
  SELECT wp_webhook_token INTO v_expected_token FROM public.crm_settings LIMIT 1;
  IF v_expected_token IS NULL OR TRIM(_token) != TRIM(v_expected_token) THEN
    IF _token NOT LIKE 'tnx_live_%' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Invalid or unauthorized unique integration code');
    END IF;
  END IF;

  -- Extract and Normalize Phone Number to strict 10 digits
  v_raw_phone   := NULLIF(TRIM(_lead->>'phone'), '');
  v_clean_phone := public.clean_10_digit_phone(v_raw_phone);

  v_name        := NULLIF(TRIM(_lead->>'name'), '');
  v_email       := NULLIF(TRIM(_lead->>'email'), '');
  v_destination := COALESCE(NULLIF(TRIM(_lead->>'city'), ''), NULLIF(TRIM(_lead->>'destination'), ''));
  v_source      := COALESCE(NULLIF(TRIM(_attribution->>'lead_source'), ''), 'WordPress CF7');

  IF v_name IS NULL AND v_clean_phone IS NULL AND v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lead must include at least name, phone, or email');
  END IF;

  -- Use pre-formatted remarks if provided, else construct Field: Value
  IF (_lead->>'remarks_formatted') IS NOT NULL AND LENGTH(TRIM(_lead->>'remarks_formatted')) > 0 THEN
    v_remark := _lead->>'remarks_formatted';
  ELSE
    v_remark := '--- Travel Inquiry Details ---';
    IF v_name IS NOT NULL THEN v_remark := v_remark || E'
Name: ' || v_name; END IF;
    IF v_clean_phone IS NOT NULL THEN v_remark := v_remark || E'
Phone: ' || v_clean_phone; END IF;
    IF v_email IS NOT NULL THEN v_remark := v_remark || E'
Email: ' || v_email; END IF;
    IF v_destination IS NOT NULL THEN v_remark := v_remark || E'
City: ' || v_destination; END IF;
    IF (_lead->>'check_in_date') IS NOT NULL THEN v_remark := v_remark || E'
Check In Date: ' || (_lead->>'check_in_date'); END IF;
    IF (_lead->>'adults') IS NOT NULL THEN v_remark := v_remark || E'
Add Adult: ' || (_lead->>'adults'); END IF;
    IF (_lead->>'children') IS NOT NULL THEN v_remark := v_remark || E'
Add Child 0-6 Years: ' || (_lead->>'children'); END IF;
    IF (_lead->>'package') IS NOT NULL THEN v_remark := v_remark || E'
Select Package: ' || (_lead->>'package'); END IF;
    IF (_lead->>'tent') IS NOT NULL THEN v_remark := v_remark || E'
Select Tent: ' || (_lead->>'tent'); END IF;
    IF (_lead->>'message') IS NOT NULL THEN v_remark := v_remark || E'
Message: ' || (_lead->>'message'); END IF;

    -- Append custom fields
    IF (_lead->'custom_fields') IS NOT NULL AND jsonb_typeof(_lead->'custom_fields') = 'object' THEN
      v_remark := v_remark || E'

--- Additional Form Fields ---';
      FOR v_key, v_val IN SELECT * FROM jsonb_each_text(_lead->'custom_fields') LOOP
        IF v_val IS NOT NULL AND v_val != '' THEN
          v_remark := v_remark || E'
' || initcap(replace(replace(v_key, '-', ' '), '_', ' ')) || ': ' || v_val;
        END IF;
      END LOOP;
    END IF;

    -- Append tracking info
    v_remark := v_remark || E'

--- Page & Tracking Info ---';
    IF (_attribution->>'page_url') IS NOT NULL THEN v_remark := v_remark || E'
Page URL: ' || (_attribution->>'page_url'); END IF;
    IF (_attribution->>'form_title') IS NOT NULL THEN v_remark := v_remark || E'
Form Title: ' || (_attribution->>'form_title'); END IF;
    IF (_attribution->>'utm_source') IS NOT NULL THEN v_remark := v_remark || E'
Campaign Source: ' || (_attribution->>'utm_source'); END IF;
    IF (_attribution->>'submitted_at') IS NOT NULL THEN v_remark := v_remark || E'
Submitted At: ' || (_attribution->>'submitted_at'); END IF;
  END IF;

  -- CHECK FOR DUPLICATE PHONE NUMBER IN leads TABLE
  IF v_clean_phone IS NOT NULL AND LENGTH(v_clean_phone) >= 7 THEN
    SELECT id INTO v_existing_lead_id
    FROM public.leads
    WHERE public.clean_10_digit_phone(phone_number) = v_clean_phone
       OR phone_number = v_clean_phone
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  -- IF DUPLICATE FOUND: INSERT INTO duplicate_leads TABLE & ATTACH TIMELINE REMARK
  IF v_existing_lead_id IS NOT NULL THEN
    INSERT INTO public.duplicate_leads (
      original_lead_id,
      name,
      phone_number,
      email,
      city,
      source,
      remarks,
      raw_payload,
      created_at
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

    -- Append remark to the original lead so telecallers see the new inquiry
    BEGIN
      INSERT INTO public.lead_remarks (
        lead_id,
        remark,
        created_at
      ) VALUES (
        v_existing_lead_id,
        E'[Duplicate Lead Inquiry Received via WordPress]
' || v_remark,
        now()
      );
      
      -- Update last_remark and updated_at on existing lead
      UPDATE public.leads
      SET last_remark = E'[Duplicate Inquiry ' || to_char(now(), 'DD Mon HH24:MI') || E'] ' || SUBSTRING(v_remark FROM 1 FOR 250),
          updated_at = now()
      WHERE id = v_existing_lead_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'duplicate_id', v_duplicate_id,
      'original_lead_id', v_existing_lead_id,
      'message', 'Mobile number exists. Lead recorded in duplicate leads table and attached to original lead timeline.'
    );
  END IF;

  -- IF NEW UNIQUE NUMBER: INSERT INTO leads TABLE
  SELECT id INTO v_status_id FROM public.lead_statuses WHERE is_default = true LIMIT 1;

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

  RETURN jsonb_build_object(
    'success', true,
    'is_duplicate', false,
    'lead_id', v_lead_id,
    'message', 'Travel lead captured successfully with full remarks in TeleNexus'
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.ingest_wordpress_lead(TEXT, JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clean_10_digit_phone(TEXT) TO anon, authenticated, service_role;
