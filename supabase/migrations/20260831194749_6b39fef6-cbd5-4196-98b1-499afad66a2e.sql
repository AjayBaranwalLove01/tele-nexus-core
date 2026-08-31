CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_first_user BOOLEAN;
  assigned_role public.app_role;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM auth.users WHERE id <> NEW.id) INTO is_first_user;
  assigned_role := CASE
    WHEN is_first_user THEN 'admin'::public.app_role
    ELSE 'telecaller'::public.app_role
  END;
  INSERT INTO public.profiles (id, full_name, email, is_approved)
  VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    is_first_user
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$function$;