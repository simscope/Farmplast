begin;

-- Derived from the exact production definitions under baselines/2026-09-12-ch23.
-- Both deployed devices use CH2_ point codes, including CH3. Preserve this wire contract.
-- Old payloads remain accepted; discarded fields are skipped BEFORE numeric/boolean casts.
set local lock_timeout = '5s';
lock table public.ch2_latest, public.ch3_latest in share row exclusive mode;

CREATE OR REPLACE FUNCTION public.ingest_ch2(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_device_code   text;
    v_device_secret text;
    v_asset_code    text := 'CH-NJ-02';
    v_device_ok     boolean;
    r               jsonb;
    v_point_code    text;
    v_point_name    text;
    v_value_number  numeric;
    v_value_boolean boolean;
    v_raw_register  integer;
    v_raw_value     numeric;
BEGIN
    v_device_code   := payload->>'device_code';
    v_device_secret := payload->>'device_secret';

    SELECT EXISTS (
        SELECT 1
        FROM devices d
        WHERE d.device_code = v_device_code
          AND d.device_secret = v_device_secret
          AND COALESCE(d.is_active, true) = true
    )
    INTO v_device_ok;

    IF NOT v_device_ok THEN
        RAISE EXCEPTION 'ingest_ch2: invalid device credentials for %', v_device_code;
    END IF;

    FOR r IN SELECT value FROM jsonb_array_elements(payload->'readings')
    LOOP
        v_point_code := r->>'point_code';

        IF v_point_code IS NULL OR v_point_code NOT IN ('CH2_R40023', 'CH2_R40024', 'CH2_R40025', 'CH2_R40051', 'CH2_R40052', 'CH2_R40056', 'CH2_R40057', 'CH2_R40061', 'CH2_SYSTEM_RUNNING', 'CH2_COMP_1A_ENABLED', 'CH2_COMP_1B_ENABLED', 'CH2_COMP_1C_ENABLED', 'CH2_COMP_2A_ENABLED', 'CH2_COMP_2B_ENABLED', 'CH2_COMP_2C_ENABLED', 'CH2_CHILLER_ENTERING_F', 'CH2_CHILLER_LEAVING_F', 'CH2_FLOW_C1_GPM', 'CH2_FLOW_C2_GPM', 'CH2_EVAP_OUT_C1_F', 'CH2_EVAP_OUT_C2_F') THEN
            CONTINUE;
        END IF;

        v_value_number := NULL;
        v_value_boolean := NULL;
        v_raw_register := NULL;
        v_raw_value := NULL;

        IF r ? 'value_number' AND COALESCE(r->>'value_number', '') <> '' THEN
            v_value_number := (r->>'value_number')::numeric;
        END IF;

        IF r ? 'value_boolean' AND COALESCE(r->>'value_boolean', '') <> '' THEN
            v_value_boolean := (r->>'value_boolean')::boolean;
        END IF;

        IF v_point_code ~ '^CH2_R[0-9]+$' THEN
            v_raw_register := replace(v_point_code, 'CH2_R', '')::integer;
            v_raw_value := v_value_number;
        END IF;

        SELECT pm.point_name
        INTO v_point_name
        FROM ch2_point_map pm
        WHERE pm.point_code = v_point_code
        LIMIT 1;

        IF v_point_name IS NULL THEN
            v_point_name := v_point_code;
        END IF;

        DELETE FROM ch2_latest
        WHERE asset_code = v_asset_code
          AND device_code = v_device_code
          AND point_code = v_point_code;

        INSERT INTO ch2_latest (
            asset_code,
            device_code,
            point_code,
            point_name,
            value_number,
            value_boolean,
            raw_register,
            raw_value,
            updated_at
        )
        VALUES (
            v_asset_code,
            v_device_code,
            v_point_code,
            v_point_name,
            v_value_number,
            v_value_boolean,
            v_raw_register,
            v_raw_value,
            now()
        );
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'asset_code', v_asset_code, 'device_code', v_device_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_ch3(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_device_code   text;
    v_device_secret text;
    v_asset_code    text := 'CH-NJ-03';
    v_device_ok     boolean;
    r               jsonb;
    v_point_code    text;
    v_point_name    text;
    v_value_number  numeric;
    v_value_boolean boolean;
    v_raw_register  integer;
    v_raw_value     numeric;
BEGIN
    v_device_code   := payload->>'device_code';
    v_device_secret := payload->>'device_secret';

    SELECT EXISTS (
        SELECT 1
        FROM devices d
        WHERE d.device_code = v_device_code
          AND d.device_secret = v_device_secret
          AND COALESCE(d.is_active, true) = true
    )
    INTO v_device_ok;

    IF NOT v_device_ok THEN
        RAISE EXCEPTION 'ingest_ch3: invalid device credentials for %', v_device_code;
    END IF;

    FOR r IN SELECT value FROM jsonb_array_elements(payload->'readings')
    LOOP
        v_point_code := r->>'point_code';

        IF v_point_code IS NULL OR v_point_code NOT IN ('CH2_R40023', 'CH2_R40024', 'CH2_R40025', 'CH2_R40051', 'CH2_R40052', 'CH2_R40056', 'CH2_R40057', 'CH2_R40061', 'CH2_SYSTEM_RUNNING', 'CH2_COMP_1A_ENABLED', 'CH2_COMP_1B_ENABLED', 'CH2_COMP_1C_ENABLED', 'CH2_COMP_2A_ENABLED', 'CH2_COMP_2B_ENABLED', 'CH2_COMP_2C_ENABLED', 'CH2_CHILLER_ENTERING_F', 'CH2_CHILLER_LEAVING_F', 'CH2_FLOW_C1_GPM', 'CH2_FLOW_C2_GPM', 'CH2_EVAP_OUT_C1_F', 'CH2_EVAP_OUT_C2_F') THEN
            CONTINUE;
        END IF;

        v_value_number := NULL;
        v_value_boolean := NULL;
        v_raw_register := NULL;
        v_raw_value := NULL;

        IF r ? 'value_number' AND COALESCE(r->>'value_number', '') <> '' THEN
            v_value_number := (r->>'value_number')::numeric;
        END IF;

        IF r ? 'value_boolean' AND COALESCE(r->>'value_boolean', '') <> '' THEN
            v_value_boolean := (r->>'value_boolean')::boolean;
        END IF;

        IF v_point_code ~ '^CH2_R[0-9]+$' THEN
            v_raw_register := replace(v_point_code, 'CH2_R', '')::integer;
            v_raw_value := v_value_number;
        END IF;

        SELECT pm.point_name
        INTO v_point_name
        FROM ch3_point_map pm
        WHERE pm.point_code = v_point_code
        LIMIT 1;

        IF v_point_name IS NULL THEN
            v_point_name := v_point_code;
        END IF;

        DELETE FROM ch3_latest
        WHERE asset_code = v_asset_code
          AND device_code = v_device_code
          AND point_code = v_point_code;

        INSERT INTO ch3_latest (
            asset_code,
            device_code,
            point_code,
            point_name,
            value_number,
            value_boolean,
            raw_register,
            raw_value,
            updated_at
        )
        VALUES (
            v_asset_code,
            v_device_code,
            v_point_code,
            v_point_name,
            v_value_number,
            v_value_boolean,
            v_raw_register,
            v_raw_value,
            now()
        );
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'asset_code', v_asset_code, 'device_code', v_device_code);
END;
$function$;

-- Keep column names/types/order for existing clients; obsolete fields have no row dependency.
create or replace view public.v_ch2_dashboard with (security_invoker=true) as
 WITH agg AS (
         SELECT max(ch2_latest.updated_at) AS latest_updated_at,
            null::timestamptz AS heartbeat_updated_at,
            null::boolean AS raw_heartbeat,
            bool_or(ch2_latest.value_boolean) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_SYSTEM_RUNNING'::text, 'CH3_SYSTEM_RUNNING'::text]))) AS system_running,
            bool_or(ch2_latest.value_boolean) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_COMP_1A_ENABLED'::text, 'CH3_COMP_1A_ENABLED'::text]))) AS comp_1a_enabled,
            bool_or(ch2_latest.value_boolean) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_COMP_1B_ENABLED'::text, 'CH3_COMP_1B_ENABLED'::text]))) AS comp_1b_enabled,
            bool_or(ch2_latest.value_boolean) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_COMP_1C_ENABLED'::text, 'CH3_COMP_1C_ENABLED'::text]))) AS comp_1c_enabled,
            bool_or(ch2_latest.value_boolean) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_COMP_2A_ENABLED'::text, 'CH3_COMP_2A_ENABLED'::text]))) AS comp_2a_enabled,
            bool_or(ch2_latest.value_boolean) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_COMP_2B_ENABLED'::text, 'CH3_COMP_2B_ENABLED'::text]))) AS comp_2b_enabled,
            bool_or(ch2_latest.value_boolean) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_COMP_2C_ENABLED'::text, 'CH3_COMP_2C_ENABLED'::text]))) AS comp_2c_enabled,
            max(ch2_latest.value_number) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_CHILLER_ENTERING_F'::text, 'CH3_CHILLER_ENTERING_F'::text]))) AS chiller_entering_f,
            max(ch2_latest.value_number) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_CHILLER_LEAVING_F'::text, 'CH3_CHILLER_LEAVING_F'::text]))) AS chiller_leaving_f,
            max(ch2_latest.value_number) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_FLOW_C1_GPM'::text, 'CH3_FLOW_C1_GPM'::text]))) AS flow_c1_gpm,
            max(ch2_latest.value_number) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_FLOW_C2_GPM'::text, 'CH3_FLOW_C2_GPM'::text]))) AS flow_c2_gpm,
            null::numeric AS capacity_c1_tons,
            max(ch2_latest.value_number) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_EVAP_OUT_C1_F'::text, 'CH3_EVAP_OUT_C1_F'::text]))) AS evap_out_c1_f,
            max(ch2_latest.value_number) FILTER (WHERE (ch2_latest.point_code = ANY (ARRAY['CH2_EVAP_OUT_C2_F'::text, 'CH3_EVAP_OUT_C2_F'::text]))) AS evap_out_c2_f,
            null::numeric AS process_delta_t_f
           FROM ch2_latest
        ), fresh AS (
         SELECT agg.latest_updated_at,
            agg.heartbeat_updated_at,
            agg.raw_heartbeat,
            agg.system_running,
            agg.comp_1a_enabled,
            agg.comp_1b_enabled,
            agg.comp_1c_enabled,
            agg.comp_2a_enabled,
            agg.comp_2b_enabled,
            agg.comp_2c_enabled,
            agg.chiller_entering_f,
            agg.chiller_leaving_f,
            agg.flow_c1_gpm,
            agg.flow_c2_gpm,
            agg.capacity_c1_tons,
            agg.evap_out_c1_f,
            agg.evap_out_c2_f,
            agg.process_delta_t_f,
            coalesce(agg.latest_updated_at > now() - interval '45 seconds', false) AS fresh_heartbeat
           FROM agg
        )
 SELECT 'CH-NJ-02'::text AS asset_code,
    'ESP32-CH2-PLC'::text AS device_code,
    fresh_heartbeat AS is_online,
    null::boolean AS heartbeat,
    COALESCE(system_running, false) AS system_running,
    COALESCE(comp_1a_enabled, false) AS comp_1a_enabled,
    COALESCE(comp_1b_enabled, false) AS comp_1b_enabled,
    COALESCE(comp_1c_enabled, false) AS comp_1c_enabled,
    COALESCE(comp_2a_enabled, false) AS comp_2a_enabled,
    COALESCE(comp_2b_enabled, false) AS comp_2b_enabled,
    COALESCE(comp_2c_enabled, false) AS comp_2c_enabled,
    chiller_entering_f,
    chiller_leaving_f,
    flow_c1_gpm,
    flow_c2_gpm,
    capacity_c1_tons,
    evap_out_c1_f,
    evap_out_c2_f,
    process_delta_t_f,
    heartbeat_updated_at,
    latest_updated_at
   FROM fresh;

delete from public.ch2_latest
where asset_code = 'CH-NJ-02' and device_code = 'ESP32-CH2-PLC'
  and point_code not in ('CH2_R40023', 'CH2_R40024', 'CH2_R40025', 'CH2_R40051', 'CH2_R40052', 'CH2_R40056', 'CH2_R40057', 'CH2_R40061', 'CH2_SYSTEM_RUNNING', 'CH2_COMP_1A_ENABLED', 'CH2_COMP_1B_ENABLED', 'CH2_COMP_1C_ENABLED', 'CH2_COMP_2A_ENABLED', 'CH2_COMP_2B_ENABLED', 'CH2_COMP_2C_ENABLED', 'CH2_CHILLER_ENTERING_F', 'CH2_CHILLER_LEAVING_F', 'CH2_FLOW_C1_GPM', 'CH2_FLOW_C2_GPM', 'CH2_EVAP_OUT_C1_F', 'CH2_EVAP_OUT_C2_F');

-- Keep column names/types/order for existing clients; obsolete fields have no row dependency.
create or replace view public.v_ch3_dashboard with (security_invoker=true) as
 WITH agg AS (
         SELECT max(ch3_latest.updated_at) AS latest_updated_at,
            null::timestamptz AS heartbeat_updated_at,
            null::boolean AS raw_heartbeat,
            bool_or(ch3_latest.value_boolean) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_SYSTEM_RUNNING'::text, 'CH3_SYSTEM_RUNNING'::text]))) AS system_running,
            bool_or(ch3_latest.value_boolean) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_COMP_1A_ENABLED'::text, 'CH3_COMP_1A_ENABLED'::text]))) AS comp_1a_enabled,
            bool_or(ch3_latest.value_boolean) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_COMP_1B_ENABLED'::text, 'CH3_COMP_1B_ENABLED'::text]))) AS comp_1b_enabled,
            bool_or(ch3_latest.value_boolean) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_COMP_1C_ENABLED'::text, 'CH3_COMP_1C_ENABLED'::text]))) AS comp_1c_enabled,
            bool_or(ch3_latest.value_boolean) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_COMP_2A_ENABLED'::text, 'CH3_COMP_2A_ENABLED'::text]))) AS comp_2a_enabled,
            bool_or(ch3_latest.value_boolean) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_COMP_2B_ENABLED'::text, 'CH3_COMP_2B_ENABLED'::text]))) AS comp_2b_enabled,
            bool_or(ch3_latest.value_boolean) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_COMP_2C_ENABLED'::text, 'CH3_COMP_2C_ENABLED'::text]))) AS comp_2c_enabled,
            max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_CHILLER_ENTERING_F'::text, 'CH3_CHILLER_ENTERING_F'::text]))) AS chiller_entering_f,
            max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_CHILLER_LEAVING_F'::text, 'CH3_CHILLER_LEAVING_F'::text]))) AS chiller_leaving_f,
            max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_FLOW_C1_GPM'::text, 'CH3_FLOW_C1_GPM'::text]))) AS flow_c1_gpm,
            max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_FLOW_C2_GPM'::text, 'CH3_FLOW_C2_GPM'::text]))) AS flow_c2_gpm,
            null::integer AS capacity_c1_tons,
            null::integer AS capacity_c2_tons,
            max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_EVAP_OUT_C1_F'::text, 'CH3_EVAP_OUT_C1_F'::text]))) AS evap_out_c1_f,
            max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.point_code = ANY (ARRAY['CH2_EVAP_OUT_C2_F'::text, 'CH3_EVAP_OUT_C2_F'::text]))) AS evap_out_c2_f,
            null::numeric AS process_delta_t_f,
            (max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.raw_register = 40023)) / 10.0) AS ch2_r40023,
            (max(ch3_latest.value_number) FILTER (WHERE (ch3_latest.raw_register = 40061)))::integer AS system_demand_percent
           FROM ch3_latest
        ), fresh AS (
         SELECT agg.latest_updated_at,
            agg.heartbeat_updated_at,
            agg.raw_heartbeat,
            agg.system_running,
            agg.comp_1a_enabled,
            agg.comp_1b_enabled,
            agg.comp_1c_enabled,
            agg.comp_2a_enabled,
            agg.comp_2b_enabled,
            agg.comp_2c_enabled,
            agg.chiller_entering_f,
            agg.chiller_leaving_f,
            agg.flow_c1_gpm,
            agg.flow_c2_gpm,
            agg.capacity_c1_tons,
            agg.capacity_c2_tons,
            agg.evap_out_c1_f,
            agg.evap_out_c2_f,
            agg.process_delta_t_f,
            agg.ch2_r40023,
            agg.system_demand_percent,
            coalesce(agg.latest_updated_at > now() - interval '45 seconds', false) AS fresh_heartbeat
           FROM agg
        )
 SELECT 'CH-NJ-03'::text AS asset_code,
    'ESP32-CH3-PLC'::text AS device_code,
    fresh_heartbeat AS is_online,
    null::boolean AS heartbeat,
    COALESCE(system_running, false) AS system_running,
    COALESCE(comp_1a_enabled, false) AS comp_1a_enabled,
    COALESCE(comp_1b_enabled, false) AS comp_1b_enabled,
    COALESCE(comp_1c_enabled, false) AS comp_1c_enabled,
    COALESCE(comp_2a_enabled, false) AS comp_2a_enabled,
    COALESCE(comp_2b_enabled, false) AS comp_2b_enabled,
    COALESCE(comp_2c_enabled, false) AS comp_2c_enabled,
    chiller_entering_f,
    chiller_leaving_f,
    flow_c1_gpm,
    flow_c2_gpm,
    capacity_c1_tons,
    capacity_c2_tons,
    evap_out_c1_f,
    evap_out_c2_f,
    process_delta_t_f,
    ch2_r40023,
    system_demand_percent,
    heartbeat_updated_at,
    latest_updated_at
   FROM fresh;

delete from public.ch3_latest
where asset_code = 'CH-NJ-03' and device_code = 'ESP32-CH3-PLC'
  and point_code not in ('CH2_R40023', 'CH2_R40024', 'CH2_R40025', 'CH2_R40051', 'CH2_R40052', 'CH2_R40056', 'CH2_R40057', 'CH2_R40061', 'CH2_SYSTEM_RUNNING', 'CH2_COMP_1A_ENABLED', 'CH2_COMP_1B_ENABLED', 'CH2_COMP_1C_ENABLED', 'CH2_COMP_2A_ENABLED', 'CH2_COMP_2B_ENABLED', 'CH2_COMP_2C_ENABLED', 'CH2_CHILLER_ENTERING_F', 'CH2_CHILLER_LEAVING_F', 'CH2_FLOW_C1_GPM', 'CH2_FLOW_C2_GPM', 'CH2_EVAP_OUT_C1_F', 'CH2_EVAP_OUT_C2_F');


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
  -- CH2 and CH3 presentation status depends only on telemetry freshness.
  select 'CH-NJ-02'::text as asset_code, max(latest_updated_at) as updated_at,
    coalesce(max(latest_updated_at) > now() - interval '45 seconds', false) as is_online,
    bool_or(comp_1a_enabled) as comp_1a_enabled, bool_or(comp_1b_enabled) as comp_1b_enabled,
    bool_or(comp_1c_enabled) as comp_1c_enabled, bool_or(comp_2a_enabled) as comp_2a_enabled,
    bool_or(comp_2b_enabled) as comp_2b_enabled, bool_or(comp_2c_enabled) as comp_2c_enabled
  from public.v_ch2_dashboard
  union all
  select 'CH-NJ-03'::text, max(latest_updated_at),
    coalesce(max(latest_updated_at) > now() - interval '45 seconds', false),
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
commit;
