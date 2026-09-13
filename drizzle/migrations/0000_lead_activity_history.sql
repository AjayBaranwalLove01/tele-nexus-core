-- Immutable, append-only lead activity history
CREATE TABLE public.lead_activity_history (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by UUID,
  performed_by_name TEXT,
  telecaller_id UUID,
  telecaller_name TEXT,
  previous_status TEXT,
  new_status TEXT,
  previous_assigned_to UUID,
  new_assigned_to UUID,
  previous_assigned_name TEXT,
  new_assigned_name TEXT,
  remarks TEXT,
  follow_up_date DATE,
  call_date DATE,
  call_outcome TEXT,
  activity_source TEXT NOT NULL DEFAULT 'live',
  import_batch_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_activity_history TO authenticated;
GRANT ALL ON public.lead_activity_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lead_activity_history_id_seq TO service_role;

ALTER TABLE public.lead_activity_history ENABLE ROW LEVEL SECURITY;

-- Read-only for app users: admins see all, telecallers see history they performed
-- or history of leads currently assigned to them. No INSERT/UPDATE/DELETE grants:
-- rows can only be written by SECURITY DEFINER triggers.
CREATE POLICY "Admin reads all lead history"
ON public.lead_activity_history FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Telecaller reads own lead history"
ON public.lead_activity_history FOR SELECT TO authenticated
USING (
  performed_by = auth.uid()
  OR telecaller_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_activity_history.lead_id AND l.assigned_to = auth.uid())
);

CREATE INDEX idx_lah_lead ON public.lead_activity_history(lead_id, created_at DESC);
CREATE INDEX idx_lah_date ON public.lead_activity_history(activity_date DESC);
CREATE INDEX idx_lah_created ON public.lead_activity_history(created_at DESC);
CREATE INDEX idx_lah_performer ON public.lead_activity_history(performed_by, activity_date);
CREATE INDEX idx_lah_telecaller ON public.lead_activity_history(telecaller_id, activity_date);
CREATE INDEX idx_lah_type ON public.lead_activity_history(activity_type);
CREATE INDEX idx_lah_status ON public.lead_activity_history(previous_status, new_status);

-- Block tampering, even by privileged roles going through the API
CREATE OR REPLACE FUNCTION public.lead_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'lead_activity_history is append-only';
END $$;

CREATE TRIGGER trg_lah_no_update BEFORE UPDATE OR DELETE ON public.lead_activity_history
FOR EACH ROW EXECUTE FUNCTION public.lead_history_immutable();

CREATE OR REPLACE FUNCTION public.profile_name(_id uuid)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT full_name FROM public.profiles WHERE id = _id
$$;

CREATE OR REPLACE FUNCTION public.status_name(_id uuid)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT name FROM public.lead_statuses WHERE id = _id
$$;

GRANT EXECUTE ON FUNCTION public.profile_name(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.status_name(uuid) TO authenticated, service_role;

-- Lead insert/update -> history
CREATE OR REPLACE FUNCTION public.track_lead_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  actor UUID := auth.uid();
  actor_name TEXT := public.profile_name(auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activity_history(
      lead_id, activity_type, activity_date, performed_by, performed_by_name,
      telecaller_id, telecaller_name, new_status, new_assigned_to, new_assigned_name,
      follow_up_date, call_date, metadata)
    VALUES (NEW.id, 'lead_created', COALESCE(NEW.lead_received_date, CURRENT_DATE), actor, actor_name,
      NEW.assigned_to, public.profile_name(NEW.assigned_to), public.status_name(NEW.status_id),
      NEW.assigned_to, public.profile_name(NEW.assigned_to), NEW.follow_up_date, NEW.call_date,
      jsonb_build_object('name', NEW.name, 'phone', NEW.phone_number));

    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.lead_activity_history(
        lead_id, activity_type, performed_by, performed_by_name, telecaller_id, telecaller_name,
        new_assigned_to, new_assigned_name)
      VALUES (NEW.id, 'assigned', actor, actor_name, NEW.assigned_to, public.profile_name(NEW.assigned_to),
        NEW.assigned_to, public.profile_name(NEW.assigned_to));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.lead_activity_history(
      lead_id, activity_type, performed_by, performed_by_name, telecaller_id, telecaller_name,
      previous_assigned_to, previous_assigned_name, new_assigned_to, new_assigned_name)
    VALUES (NEW.id,
      CASE WHEN NEW.assigned_to IS NULL THEN 'unassigned'
           WHEN OLD.assigned_to IS NULL THEN 'assigned' ELSE 'reassigned' END,
      actor, actor_name, NEW.assigned_to, public.profile_name(NEW.assigned_to),
      OLD.assigned_to, public.profile_name(OLD.assigned_to),
      NEW.assigned_to, public.profile_name(NEW.assigned_to));
  END IF;

  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    INSERT INTO public.lead_activity_history(
      lead_id, activity_type, performed_by, performed_by_name, telecaller_id, telecaller_name,
      previous_status, new_status, follow_up_date, call_date)
    VALUES (NEW.id, 'status_changed', actor, actor_name,
      COALESCE(NEW.assigned_to, OLD.assigned_to), public.profile_name(COALESCE(NEW.assigned_to, OLD.assigned_to)),
      public.status_name(OLD.status_id), public.status_name(NEW.status_id), NEW.follow_up_date, NEW.call_date);
  END IF;

  IF NEW.call_date IS DISTINCT FROM OLD.call_date AND NEW.call_date IS NOT NULL THEN
    INSERT INTO public.lead_activity_history(
      lead_id, activity_type, activity_date, performed_by, performed_by_name,
      telecaller_id, telecaller_name, new_status, call_date, follow_up_date)
    VALUES (NEW.id, 'call_logged', NEW.call_date, actor, actor_name,
      COALESCE(NEW.assigned_to, OLD.assigned_to), public.profile_name(COALESCE(NEW.assigned_to, OLD.assigned_to)),
      public.status_name(NEW.status_id), NEW.call_date, NEW.follow_up_date);
  END IF;

  IF NEW.follow_up_date IS DISTINCT FROM OLD.follow_up_date THEN
    INSERT INTO public.lead_activity_history(
      lead_id, activity_type, performed_by, performed_by_name, telecaller_id, telecaller_name,
      follow_up_date, new_status)
    VALUES (NEW.id, 'followup_set', actor, actor_name,
      COALESCE(NEW.assigned_to, OLD.assigned_to), public.profile_name(COALESCE(NEW.assigned_to, OLD.assigned_to)),
      NEW.follow_up_date, public.status_name(NEW.status_id));
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    INSERT INTO public.lead_activity_history(
      lead_id, activity_type, performed_by, performed_by_name, telecaller_id, telecaller_name,
      previous_status, new_status)
    VALUES (NEW.id, CASE WHEN NEW.completed_at IS NULL THEN 'reopened' ELSE 'completed' END,
      actor, actor_name, COALESCE(NEW.assigned_to, OLD.assigned_to),
      public.profile_name(COALESCE(NEW.assigned_to, OLD.assigned_to)),
      public.status_name(OLD.status_id), public.status_name(NEW.status_id));
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_lead_history_ins AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.track_lead_history();

CREATE TRIGGER trg_lead_history_upd AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.track_lead_history();

-- Remarks -> history
CREATE OR REPLACE FUNCTION public.track_remark_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l RECORD;
BEGIN
  SELECT assigned_to, status_id, follow_up_date, call_date INTO l FROM public.leads WHERE id = NEW.lead_id;
  INSERT INTO public.lead_activity_history(
    lead_id, activity_type, activity_date, performed_by, performed_by_name,
    telecaller_id, telecaller_name, new_status, remarks, follow_up_date, call_date)
  VALUES (NEW.lead_id, 'remark_added', NEW.created_at::date, NEW.user_id, public.profile_name(NEW.user_id),
    COALESCE(l.assigned_to, NEW.user_id), public.profile_name(COALESCE(l.assigned_to, NEW.user_id)),
    public.status_name(l.status_id), NEW.remark, l.follow_up_date, l.call_date);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_remark_history AFTER INSERT ON public.lead_remarks
FOR EACH ROW EXECUTE FUNCTION public.track_remark_history();

-- Backfill: only facts derivable from existing data (activity_source = 'migration')
INSERT INTO public.lead_activity_history(
  lead_id, activity_type, activity_date, created_at, telecaller_id, telecaller_name,
  new_status, new_assigned_to, new_assigned_name, follow_up_date, call_date, activity_source)
SELECT l.id, 'lead_created', COALESCE(l.lead_received_date, l.created_at::date), l.created_at,
  l.assigned_to, public.profile_name(l.assigned_to), public.status_name(l.status_id),
  l.assigned_to, public.profile_name(l.assigned_to), l.follow_up_date, l.call_date, 'migration'
FROM public.leads l;

INSERT INTO public.lead_activity_history(
  lead_id, activity_type, activity_date, created_at, telecaller_id, telecaller_name,
  new_assigned_to, new_assigned_name, activity_source)
SELECT l.id, 'assigned', l.assigned_at::date, l.assigned_at, l.assigned_to,
  public.profile_name(l.assigned_to), l.assigned_to, public.profile_name(l.assigned_to), 'migration'
FROM public.leads l WHERE l.assigned_to IS NOT NULL AND l.assigned_at IS NOT NULL;

INSERT INTO public.lead_activity_history(
  lead_id, activity_type, activity_date, created_at, performed_by, performed_by_name,
  telecaller_id, telecaller_name, remarks, activity_source)
SELECT r.lead_id, 'remark_added', r.created_at::date, r.created_at, r.user_id,
  public.profile_name(r.user_id), r.user_id, public.profile_name(r.user_id), r.remark, 'migration'
FROM public.lead_remarks r;