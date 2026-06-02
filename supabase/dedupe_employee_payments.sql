begin;

with ranked_payments as (
  select
    id,
    row_number() over (
      partition by employee_id, period_start, period_end
      order by paid_at desc nulls last, created_at desc nulls last, id desc
    ) as row_num
  from public.employee_payments
)
delete from public.employee_payments
using ranked_payments
where employee_payments.id = ranked_payments.id
  and ranked_payments.row_num > 1;

create unique index if not exists employee_payments_employee_period_uidx
  on public.employee_payments (employee_id, period_start, period_end);

commit;
