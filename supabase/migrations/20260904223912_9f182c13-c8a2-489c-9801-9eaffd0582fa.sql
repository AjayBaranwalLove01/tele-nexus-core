INSERT INTO public.profiles (id, full_name, email, is_approved)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
       u.email,
       false
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'telecaller'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;