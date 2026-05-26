create table if not exists public.employee_tax_profiles (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  federal_filing_status text not null default 'single',
  federal_w4_step3 numeric not null default 0,
  federal_w4_step4a numeric not null default 0,
  federal_w4_step4b numeric not null default 0,
  federal_w4_step4c numeric not null default 0,
  nj_withholding_rate text not null default 'A',
  nj_allowances integer not null default 0,
  nj_additional_withholding numeric not null default 0,
  nj_exempt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_tax_profiles_federal_filing_status_check
    check (federal_filing_status in ('single', 'married', 'headOfHousehold')),
  constraint employee_tax_profiles_nj_withholding_rate_check
    check (nj_withholding_rate in ('A', 'B')),
  constraint employee_tax_profiles_nj_allowances_check
    check (nj_allowances >= 0)
);

create or replace function public.set_employee_tax_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employee_tax_profiles_set_updated_at
  on public.employee_tax_profiles;

create trigger employee_tax_profiles_set_updated_at
before update on public.employee_tax_profiles
for each row
execute function public.set_employee_tax_profiles_updated_at();

alter table public.employee_tax_profiles enable row level security;

drop policy if exists "Allow authenticated read employee tax profiles"
  on public.employee_tax_profiles;

create policy "Allow authenticated read employee tax profiles"
on public.employee_tax_profiles
for select
to authenticated
using (true);

drop policy if exists "Allow authenticated write employee tax profiles"
  on public.employee_tax_profiles;

create policy "Allow authenticated write employee tax profiles"
on public.employee_tax_profiles
for all
to authenticated
using (true)
with check (true);

insert into public.employee_tax_profiles (employee_id)
select id
from public.employees
on conflict (employee_id) do nothing;
