alter table public.employees
add column if not exists default_lunch_hours numeric not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_default_lunch_hours_check'
  ) then
    alter table public.employees
      add constraint employees_default_lunch_hours_check
      check (default_lunch_hours in (0, 0.5, 1));
  end if;
end $$;

comment on column public.employees.default_lunch_hours is
  'Default lunch hours used when creating employee work log rows.';
