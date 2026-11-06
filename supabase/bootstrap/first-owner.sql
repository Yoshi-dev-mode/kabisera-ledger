-- Create the FIRST owner. Run this once, by hand, after the migrations.
--
-- Step 1. Create your sign-in. In Supabase Studio open  Authentication > Users > Add user > Create new user.
--         Enter your email and a strong password (12+ characters) and tick "Auto Confirm User".
-- Step 2. Replace the two values below, then run this script in the SQL Editor.
--         The result must say "INSERT 0 1" (or show 1 row). "INSERT 0 0" means the email was not found.
--
-- This is the only way to make an owner. The app cannot create owners, by design.
-- Staff are added later from the Staff Management screen.

insert into public.profiles (id, display_name, role)
select id, 'Yoshi', 'owner'
from auth.users
where email = 'evanyoshi19@gmail.com'
on conflict (id) do nothing;

-- Check:
select p.display_name, p.role, p.is_active, u.email
from public.profiles p join auth.users u on u.id = p.id
where p.role = 'owner';
