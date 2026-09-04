ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_date date DEFAULT CURRENT_DATE;

UPDATE public.leads SET call_date = COALESCE(updated_at::date, CURRENT_DATE) WHERE call_date IS NULL;