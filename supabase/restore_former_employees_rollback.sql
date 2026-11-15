-- Restore original Farmplast feature guard and remove Restore RPCs.
-- Only after disabling employee_rehire and reverting the site.
begin;
set local lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.guard_employee_feature_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'UPDATE' then
    if old.active is true and new.active is not true then perform public.employee_require_feature('employee_terminate'); end if;
    if old.active is not true and new.active is true then perform public.employee_require_feature('employee_rehire'); end if;
    if (new.termination_date, new.termination_reason, new.termination_notes) is distinct from
       (old.termination_date, old.termination_reason, old.termination_notes) then
      perform public.employee_require_feature(case when old.active is not true and new.active is true then 'employee_rehire' else 'employee_terminate' end);
    end if;
    if new.employee_number is distinct from old.employee_number
      and (current_setting('farmplast.employee_plant_transfer', true) is distinct from old.id::text or not exists (
        select 1 from public.employee_employment_periods p
        where p.employee_id = old.id and p.termination_date is null and not p.legacy_inactive
          and p.transferred_from_period_id is not null and p.employee_number = new.employee_number
          and p.terminal_user_id = new.zkt_user_id and p.plant_location = new.plant_location
      )) then
      perform public.employee_require_feature('employee_number_reuse');
    end if;
  end if;
  return new;
end $function$
;
drop function if exists public.restore_former_employee(uuid,date);
drop function if exists public.preview_restore_former_employee(uuid);
commit;
