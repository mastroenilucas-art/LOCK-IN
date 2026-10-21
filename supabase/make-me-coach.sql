-- Turns your login into the coach account.
-- 1. Put the email of your login between the quotes below.
-- 2. Supabase → SQL Editor → new query → paste → Run.
-- You should see one row with role = coach. No rows means the email didn't match a login.

update public.profiles
set role = 'coach'
where lower(email) = lower('YOUR-EMAIL@example.com')
returning email, role;
