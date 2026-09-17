CREATE TABLE IF NOT EXISTS public.lead_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telecaller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  approved_count integer,
  assigned_count integer,
  note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_requests_status ON public.lead_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_requests_caller ON public.lead_requests(telecaller_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_requests_one_pending ON public.lead_requests(telecaller_id) WHERE status = 'pending';

GRANT SELECT, INSERT ON public.lead_requests TO authenticated;
GRANT UPDATE ON public.lead_requests TO authenticated;
GRANT ALL ON public.lead_requests TO service_role;

ALTER TABLE public.lead_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own requests or admin read" ON public.lead_requests
  FOR SELECT TO authenticated
  USING (telecaller_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Insert own request" ON public.lead_requests
  FOR INSERT TO authenticated
  WITH CHECK (telecaller_id = auth.uid());

CREATE POLICY "Admin updates requests" ON public.lead_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.request_more_leads(_count integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE new_id uuid;
BEGIN
  IF _count IS NULL OR _count < 1 THEN RAISE EXCEPTION 'Requested count must be at least 1'; END IF;
  IF EXISTS (SELECT 1 FROM public.lead_requests WHERE telecaller_id = auth.uid() AND status = 'pending') THEN
    RAISE EXCEPTION 'You already have a pending request awaiting admin approval';
  END IF;
  INSERT INTO public.lead_requests(telecaller_id, requested_count)
  VALUES (auth.uid(), _count) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.approve_lead_request(_id uuid, _count integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.lead_requests%ROWTYPE; n integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only admins can approve lead requests'; END IF;
  SELECT * INTO r FROM public.lead_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;
  IF _count IS NULL OR _count < 1 THEN RAISE EXCEPTION 'Approved count must be at least 1'; END IF;

  n := public.assign_leads_to_telecaller(r.telecaller_id, _count);

  UPDATE public.lead_requests
  SET status = 'approved', approved_count = _count, assigned_count = n,
      reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _id;

  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.reject_lead_request(_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only admins can reject lead requests'; END IF;
  UPDATE public.lead_requests
  SET status = 'rejected', note = _note, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _id AND status = 'pending';
END $$;

REVOKE ALL ON FUNCTION public.request_more_leads(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_lead_request(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_lead_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_more_leads(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_lead_request(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_lead_request(uuid, text) TO authenticated;
