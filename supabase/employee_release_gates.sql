-- Phase 3: apply after employee_lifecycle.sql. Archive viewing is independent.
begin;
create table if not exists public.employee_release_config (
  singleton boolean primary key default true check(singleton),
  actions_enabled boolean not null default false
);
insert into public.employee_release_config(singleton) values(true)
on conflict(singleton) do update set actions_enabled=false;
update public.employee_number_config set reuse_enabled=false where singleton;
create table public.employee_release_evidence (
  gate text primary key check(gate in ('nj_physical','pa_physical','historical_uuid','live_sacs','backup_restore','database_migrations','concurrency','rollback')),
  verified_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>verified_at),
  candidate_commit text not null check(candidate_commit ~ '^[0-9a-f]{40}$'),
  evidence_reference text not null check(length(trim(evidence_reference))>=12)
);
alter table public.employee_release_config enable row level security;
alter table public.employee_release_evidence enable row level security;
revoke all on public.employee_release_config,public.employee_release_evidence from public,anon,authenticated,service_role;
grant select on public.employee_release_config,public.employee_release_evidence to authenticated;
create policy archive_admin_read on public.employee_release_config for select to authenticated using(public.employee_archive_admin());
create policy archive_admin_read on public.employee_release_evidence for select to authenticated using(public.employee_archive_admin());

create function public.employee_reuse_release_verified() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select count(*)=8 and count(distinct candidate_commit)=1
  from public.employee_release_evidence where verified_at<=now() and expires_at>now()
$$;
revoke all on function public.employee_reuse_release_verified() from public,anon,authenticated,service_role;

alter function public.next_available_employee_number() rename to next_available_employee_number_pre_release;
revoke all on function public.next_available_employee_number_pre_release() from public,anon,authenticated,service_role;
create function public.next_available_employee_number() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if exists(select 1 from public.employee_number_config where reuse_enabled)
    and not public.employee_reuse_release_verified() then
    raise exception 'Number reuse release evidence is missing or expired';
  end if;
  return public.next_available_employee_number_pre_release();
end $$;
revoke all on function public.next_available_employee_number() from public,anon,service_role;
grant execute on function public.next_available_employee_number() to authenticated;

create function public.guard_employee_reuse_release() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.reuse_enabled and not public.employee_reuse_release_verified() then
    raise exception 'Number reuse requires all eight current release confirmations';
  end if;
  return new;
end $$;
create trigger employee_reuse_release_gate before insert or update on public.employee_number_config
for each row execute function public.guard_employee_reuse_release();
-- Fail closed even if evidence expires after the operator enabled reuse.
create function public.guard_employee_reuse_allocation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.employee_number_config where reuse_enabled)
    and not public.employee_reuse_release_verified() then
    raise exception 'Number reuse release evidence is missing or expired';
  end if;
  return new;
end $$;
create trigger a_employee_reuse_release_allocation before insert or update of employee_number on public.employees
for each row execute function public.guard_employee_reuse_allocation();

alter function public.change_employee_employment(uuid,text,date,text,text) rename to change_employee_employment_pre_release;
revoke all on function public.change_employee_employment_pre_release(uuid,text,date,text,text) from public,anon,authenticated,service_role;
create function public.change_employee_employment(p_employee_id uuid,p_action text,p_date date,p_reason text default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(736261,2);
  perform 1 from public.employee_release_config where singleton and actions_enabled for share;
  if not found then raise exception 'Terminate/Rehire release gate is OFF'; end if;
  return public.change_employee_employment_pre_release(p_employee_id,p_action,p_date,p_reason,p_notes);
end $$;
revoke all on function public.change_employee_employment(uuid,text,date,text,text) from public,anon,service_role;
grant execute on function public.change_employee_employment(uuid,text,date,text,text) to authenticated;
create or replace function public.employee_lifecycle_blockers() returns text[]
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.employee_archive_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if not exists(select 1 from public.employee_release_config where singleton and actions_enabled) then
    return array['Terminate/Rehire release gate is OFF'];
  end if;
  return '{}'::text[];
end $$;
commit;
