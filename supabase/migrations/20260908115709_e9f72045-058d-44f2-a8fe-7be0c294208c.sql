REVOKE EXECUTE ON FUNCTION public.assign_leads_by_ids(uuid, bigint[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_leads_by_ids(uuid, bigint[]) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_leads_by_ids(uuid, bigint[]) TO authenticated;