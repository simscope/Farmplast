alter table public.employees
add column if not exists plant_location text not null default 'NJ';

update public.employees
set plant_location = 'NJ'
where plant_location is null
   or plant_location not in ('NJ', 'PA');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_plant_location_check'
  ) then
    alter table public.employees
      add constraint employees_plant_location_check
      check (plant_location in ('NJ', 'PA'));
  end if;
end $$;

comment on column public.employees.plant_location is
  'Primary plant location for grouping employees and ZKT device assignment. NJ or PA.';
