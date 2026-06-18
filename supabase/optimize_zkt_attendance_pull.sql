-- Optimize ZKT attendance pulls and dashboard refreshes.
--
-- Run this in the Supabase SQL editor. The blocks are defensive so the script
-- can be used across environments where some optional columns are absent.

-- The Windows bridge normally polls pending commands by status/created_at.
do $$
begin
  if to_regclass('public.zkt_bridge_commands') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_bridge_commands' and column_name = 'status'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_bridge_commands' and column_name = 'created_at'
     ) then
    create index if not exists zkt_bridge_commands_status_created_at_idx
      on public.zkt_bridge_commands (status, created_at);
  end if;
end $$;

-- Attendance imports usually de-dupe and order by device user/time. Without
-- these indexes the bridge can scan the whole attendance table and hit the
-- statement timeout as the table grows.
do $$
begin
  if to_regclass('public.zkt_attendance_logs') is null then
    return;
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_attendance_logs' and column_name = 'zkt_user_id'
     ) and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_attendance_logs' and column_name = 'punch_time'
     ) then
    create index if not exists zkt_attendance_logs_zkt_user_punch_time_idx
      on public.zkt_attendance_logs (zkt_user_id, punch_time);
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_attendance_logs' and column_name = 'employee_id'
     ) and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_attendance_logs' and column_name = 'punch_time'
     ) then
    create index if not exists zkt_attendance_logs_employee_punch_time_idx
      on public.zkt_attendance_logs (employee_id, punch_time);
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_attendance_logs' and column_name = 'employee_id'
     ) and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_attendance_logs' and column_name = 'work_date'
     ) then
    create index if not exists zkt_attendance_logs_employee_work_date_idx
      on public.zkt_attendance_logs (employee_id, work_date);
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'zkt_attendance_logs' and column_name = 'work_date'
     ) then
    create index if not exists zkt_attendance_logs_work_date_idx
      on public.zkt_attendance_logs (work_date);
  end if;
end $$;

-- Payroll and current-presence refreshes repeatedly read work logs by employee
-- and week, excluding deleted rows.
do $$
begin
  if to_regclass('public.employee_work_logs') is null then
    return;
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employee_work_logs' and column_name = 'employee_id'
     ) and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employee_work_logs' and column_name = 'work_date'
     ) and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employee_work_logs' and column_name = 'is_deleted'
     ) then
    create index if not exists employee_work_logs_employee_work_date_active_idx
      on public.employee_work_logs (employee_id, work_date)
      where is_deleted is not true;

    create index if not exists employee_work_logs_work_date_active_idx
      on public.employee_work_logs (work_date)
      where is_deleted is not true;
  end if;
end $$;

-- Employee lookup by ZKT user id is part of matching device punches to database
-- employees during import.
do $$
begin
  if to_regclass('public.employees') is null then
    return;
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employees' and column_name = 'zkt_user_id'
     ) then
    create index if not exists employees_zkt_user_id_idx
      on public.employees (zkt_user_id);
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employees' and column_name = 'active'
     ) and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employees' and column_name = 'zkt_enabled'
     ) then
    create index if not exists employees_active_zkt_enabled_idx
      on public.employees (active, zkt_enabled);
  end if;
end $$;

-- Refresh planner statistics only for tables that exist.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'zkt_bridge_commands',
    'zkt_attendance_logs',
    'employee_work_logs',
    'employees'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('analyze public.%I', table_name);
    end if;
  end loop;
end $$;
