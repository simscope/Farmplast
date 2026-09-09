begin;

-- Public presentation mapping: the existing NJ UI swaps the two physical barrels.
-- Fixed slots plus scalar aggregates guarantee five rows, including absent telemetry.
-- Invoker security preserves the caller's existing underlying view/table permissions.
create or replace view public.v_nj_monitoring_overview
with (security_invoker = true) as
with slots(asset_code, asset_name, asset_type, source_code) as (
  values
    ('CH-NJ-01', 'Chiller 1', 'chiller', 'CH-NJ-01'),
    ('CH-NJ-02', 'Chiller 2', 'chiller', 'CH-NJ-02'),
    ('CH-NJ-03', 'Chiller 3', 'chiller', 'CH-NJ-03'),
    ('BARREL-NJ-01', 'Material Barrel 1', 'barrel', 'BARREL-NJ-02'),
    ('BARREL-NJ-02', 'Material Barrel 2', 'barrel', 'BARREL-NJ-01')
), points_summary as (
  select
    asset_code,
    max(updated_at) as updated_at,
    -- Match monitoringHelpers.hasRealTelemetry for CH1 (including zero/false rules).
    bool_or(case
      when data_type = 'boolean' then value_boolean is true
      when data_type = 'number' then
        case when upper(point_code) similar to '%(TEMP|CHW|COND|INLET|OUTLET|SUCTION|DISCHARGE|PRESSURE|COMP)%'
          or upper(point_group) similar to '%(TEMPERATURE|PRESSURE|COMPRESSOR)%'
        then value_number > 0 else value_number <> 0 end
      else coalesce(trim(value_text), '') <> ''
    end) as chiller_has_data,
    bool_or(case
      when data_type = 'boolean' then value_boolean is not null
      when data_type = 'number' then value_number is not null
      else coalesce(trim(value_text), '') <> ''
        or upper(point_code) similar to '%(STATUS|ALARM|LOW)%'
        or upper(point_name) similar to '%(STATUS|ALARM)%'
    end) as barrel_has_data,
    bool_or(value_boolean) filter (where point_code in ('BARREL1_ONLINE', 'BARREL2_ONLINE')) as barrel_online,
    bool_or(value_boolean) filter (where point_code = 'CH1_COMP1') as comp_1a_enabled,
    bool_or(value_boolean) filter (where point_code = 'CH1_COMP2') as comp_1b_enabled,
    max(value_number) filter (where point_code in ('BARREL1_LEVEL_PERCENT', 'BARREL2_LEVEL_PERCENT')) as level_percent,
    bool_or(value_boolean) filter (where point_code in ('BARREL1_HAS_ERROR', 'BARREL2_HAS_ERROR')) as has_error
  from public.v_asset_points_latest
  where asset_code in ('CH-NJ-01', 'BARREL-NJ-01', 'BARREL-NJ-02')
  group by asset_code
), dashboards as (
  -- Reuse the existing server-side heartbeat/freshness semantics, without raw reads.
  select 'CH-NJ-02'::text as asset_code, max(latest_updated_at) as updated_at,
    bool_or(is_online) as is_online,
    bool_or(comp_1a_enabled) as comp_1a_enabled, bool_or(comp_1b_enabled) as comp_1b_enabled,
    bool_or(comp_1c_enabled) as comp_1c_enabled, bool_or(comp_2a_enabled) as comp_2a_enabled,
    bool_or(comp_2b_enabled) as comp_2b_enabled, bool_or(comp_2c_enabled) as comp_2c_enabled
  from public.v_ch2_dashboard
  union all
  select 'CH-NJ-03'::text, max(latest_updated_at), bool_or(is_online),
    bool_or(comp_1a_enabled), bool_or(comp_1b_enabled), bool_or(comp_1c_enabled),
    bool_or(comp_2a_enabled), bool_or(comp_2b_enabled), bool_or(comp_2c_enabled)
  from public.v_ch3_dashboard
)
select
  s.asset_code, s.asset_name, s.asset_type,
  coalesce(d.updated_at, p.updated_at) as updated_at,
  case when s.asset_code in ('CH-NJ-02', 'CH-NJ-03') then coalesce(d.is_online, false)
    -- Same floor(seconds) <= 15 boundary as ONLINE_THRESHOLD_SEC in monitoringHelpers.
    when s.asset_type = 'barrel' then coalesce(
      p.updated_at > now() - interval '16 seconds'
      and coalesce(p.barrel_online, p.barrel_has_data), false)
    else coalesce(p.updated_at > now() - interval '16 seconds' and p.chiller_has_data, false)
  end as is_online,
  coalesce(d.comp_1a_enabled, p.comp_1a_enabled) as comp_1a_enabled,
  coalesce(d.comp_1b_enabled, p.comp_1b_enabled) as comp_1b_enabled,
  d.comp_1c_enabled, d.comp_2a_enabled, d.comp_2b_enabled, d.comp_2c_enabled,
  p.level_percent, p.has_error
from slots s
left join points_summary p on p.asset_code = s.source_code
left join dashboards d on d.asset_code = s.source_code;

comment on view public.v_nj_monitoring_overview is
  'Five compact NJ presentation slots; barrel sources intentionally swapped. CH1 COMP1/COMP2 map to 1A/1B; unsupported positions are NULL. No diagnostics or identifiers.';
grant select on public.v_nj_monitoring_overview to anon, authenticated;
commit;
