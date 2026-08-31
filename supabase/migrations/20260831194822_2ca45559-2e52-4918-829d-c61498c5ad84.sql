-- Trigger + internal-only functions: not callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_refill_on_complete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_remarks_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_lead_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_telecaller_assignment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_leads_to_telecaller(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_stale_sessions() FROM PUBLIC, anon, authenticated;

-- App-facing routines: signed-in users only, never anonymous
REVOKE ALL ON FUNCTION public.get_more_leads() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.distribute_leads(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recall_unused_leads(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_insert_leads(jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_more_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_leads(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recall_unused_leads(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_leads(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;