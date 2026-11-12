-- Read only the caller's persisted admin role without exposing the RLS-protected profiles table.
create or replace function public.can_use_sacs_sso()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
revoke all on function public.can_use_sacs_sso() from public,anon;
grant execute on function public.can_use_sacs_sso() to authenticated;
