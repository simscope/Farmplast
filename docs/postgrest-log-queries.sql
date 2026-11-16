-- Read-only Supabase Logs Explorer queries (ClickHouse log schema).
-- Keep dashboard time preset wide enough to cover explicit UTC bounds.
-- These queries were executed before measurement GETs at 2026-09-20 20:47 UTC.
-- No SQL Editor / production database mutation is needed.

-- Near-day window, 23h50m. All 14 endpoint/method/status groups fit LIMIT 80.
select concat(
  log_attributes['request.path'], ' | ', log_attributes['request.method'],
  ' | status=', log_attributes['response.status_code'],
  ' | n=', toString(count(*)),
  ' | bytes=', toString(sum(toInt64OrZero(log_attributes['response.headers.content_length']))),
  ' | lengths=', toString(countIf(log_attributes['response.headers.content_length'] != ''))
) as traffic
from logs
where source = 'edge_logs'
  and timestamp >= '2026-09-19 20:50:00'
  and timestamp < '2026-09-20 20:40:00'
group by log_attributes['request.path'], log_attributes['request.method'], log_attributes['response.status_code']
order by count(*) desc limit 80;

-- Fixed last hour: same aggregate with lower bound 2026-09-20 19:40:00.
-- Caller verification, no credentials/IPs/personal records selected.
select concat(
  log_attributes['request.path'], ' | UA=', log_attributes['request.headers.user_agent'],
  ' | query=', log_attributes['request.search'], ' | prefer=', log_attributes['request.headers.prefer'],
  ' | n=', toString(count(*)),
  ' | request lengths=', toString(min(toInt64OrZero(log_attributes['request.headers.content_length']))),
  '..', toString(max(toInt64OrZero(log_attributes['request.headers.content_length'])))
) as callers
from logs
where source = 'edge_logs'
  and timestamp >= '2026-09-20 19:40:00'
  and timestamp < '2026-09-20 20:40:00'
group by log_attributes['request.path'], log_attributes['request.headers.user_agent'],
  log_attributes['request.search'], log_attributes['request.headers.prefer']
order by count(*) desc limit 30;
