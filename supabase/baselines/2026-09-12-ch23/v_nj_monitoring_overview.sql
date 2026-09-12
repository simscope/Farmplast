create or replace view public.v_nj_monitoring_overview with (security_invoker=true) as
 WITH slots(asset_code, asset_name, asset_type, source_code) AS (
         VALUES ('CH-NJ-01'::text,'Chiller 1'::text,'chiller'::text,'CH-NJ-01'::text), ('CH-NJ-02'::text,'Chiller 2'::text,'chiller'::text,'CH-NJ-02'::text), ('CH-NJ-03'::text,'Chiller 3'::text,'chiller'::text,'CH-NJ-03'::text), ('BARREL-NJ-01'::text,'Material Barrel 1'::text,'barrel'::text,'BARREL-NJ-02'::text), ('BARREL-NJ-02'::text,'Material Barrel 2'::text,'barrel'::text,'BARREL-NJ-01'::text)
        ), points_summary AS (
         SELECT v_asset_points_latest.asset_code,
            max(v_asset_points_latest.updated_at) AS updated_at,
            bool_or(
                CASE
                    WHEN (v_asset_points_latest.data_type = 'boolean'::text) THEN (v_asset_points_latest.value_boolean IS TRUE)
                    WHEN (v_asset_points_latest.data_type = 'number'::text) THEN
                    CASE
                        WHEN ((upper(v_asset_points_latest.point_code) ~ similar_to_escape('%(TEMP|CHW|COND|INLET|OUTLET|SUCTION|DISCHARGE|PRESSURE|COMP)%'::text)) OR (upper(v_asset_points_latest.point_group) ~ similar_to_escape('%(TEMPERATURE|PRESSURE|COMPRESSOR)%'::text))) THEN (v_asset_points_latest.value_number > (0)::double precision)
                        ELSE (v_asset_points_latest.value_number <> (0)::double precision)
                    END
                    ELSE (COALESCE(TRIM(BOTH FROM v_asset_points_latest.value_text), ''::text) <> ''::text)
                END) AS chiller_has_data,
            bool_or(
                CASE
                    WHEN (v_asset_points_latest.data_type = 'boolean'::text) THEN (v_asset_points_latest.value_boolean IS NOT NULL)
                    WHEN (v_asset_points_latest.data_type = 'number'::text) THEN (v_asset_points_latest.value_number IS NOT NULL)
                    ELSE ((COALESCE(TRIM(BOTH FROM v_asset_points_latest.value_text), ''::text) <> ''::text) OR (upper(v_asset_points_latest.point_code) ~ similar_to_escape('%(STATUS|ALARM|LOW)%'::text)) OR (upper(v_asset_points_latest.point_name) ~ similar_to_escape('%(STATUS|ALARM)%'::text)))
                END) AS barrel_has_data,
            bool_or(v_asset_points_latest.value_boolean) FILTER (WHERE (v_asset_points_latest.point_code = ANY (ARRAY['BARREL1_ONLINE'::text, 'BARREL2_ONLINE'::text]))) AS barrel_online,
            bool_or(v_asset_points_latest.value_boolean) FILTER (WHERE (v_asset_points_latest.point_code = 'CH1_COMP1'::text)) AS comp_1a_enabled,
            bool_or(v_asset_points_latest.value_boolean) FILTER (WHERE (v_asset_points_latest.point_code = 'CH1_COMP2'::text)) AS comp_1b_enabled,
            max(v_asset_points_latest.value_number) FILTER (WHERE (v_asset_points_latest.point_code = ANY (ARRAY['BARREL1_LEVEL_PERCENT'::text, 'BARREL2_LEVEL_PERCENT'::text]))) AS level_percent,
            bool_or(v_asset_points_latest.value_boolean) FILTER (WHERE (v_asset_points_latest.point_code = ANY (ARRAY['BARREL1_HAS_ERROR'::text, 'BARREL2_HAS_ERROR'::text]))) AS has_error
           FROM v_asset_points_latest
          WHERE (v_asset_points_latest.asset_code = ANY (ARRAY['CH-NJ-01'::text, 'BARREL-NJ-01'::text, 'BARREL-NJ-02'::text]))
          GROUP BY v_asset_points_latest.asset_code
        ), dashboards AS (
         SELECT 'CH-NJ-02'::text AS asset_code,
            max(v_ch2_dashboard.latest_updated_at) AS updated_at,
            COALESCE((max(v_ch2_dashboard.latest_updated_at) > (now() - '00:00:45'::interval)), false) AS is_online,
            bool_or(v_ch2_dashboard.comp_1a_enabled) AS comp_1a_enabled,
            bool_or(v_ch2_dashboard.comp_1b_enabled) AS comp_1b_enabled,
            bool_or(v_ch2_dashboard.comp_1c_enabled) AS comp_1c_enabled,
            bool_or(v_ch2_dashboard.comp_2a_enabled) AS comp_2a_enabled,
            bool_or(v_ch2_dashboard.comp_2b_enabled) AS comp_2b_enabled,
            bool_or(v_ch2_dashboard.comp_2c_enabled) AS comp_2c_enabled
           FROM v_ch2_dashboard
        UNION ALL
         SELECT 'CH-NJ-03'::text AS text,
            max(v_ch3_dashboard.latest_updated_at) AS max,
            bool_or(v_ch3_dashboard.is_online) AS bool_or,
            bool_or(v_ch3_dashboard.comp_1a_enabled) AS bool_or,
            bool_or(v_ch3_dashboard.comp_1b_enabled) AS bool_or,
            bool_or(v_ch3_dashboard.comp_1c_enabled) AS bool_or,
            bool_or(v_ch3_dashboard.comp_2a_enabled) AS bool_or,
            bool_or(v_ch3_dashboard.comp_2b_enabled) AS bool_or,
            bool_or(v_ch3_dashboard.comp_2c_enabled) AS bool_or
           FROM v_ch3_dashboard
        )
 SELECT s.asset_code,
    s.asset_name,
    s.asset_type,
    COALESCE(d.updated_at, p.updated_at) AS updated_at,
        CASE
            WHEN (s.asset_code = ANY (ARRAY['CH-NJ-02'::text, 'CH-NJ-03'::text])) THEN COALESCE(d.is_online, false)
            WHEN (s.asset_type = 'barrel'::text) THEN COALESCE(((p.updated_at > (now() - '00:00:16'::interval)) AND COALESCE(p.barrel_online, p.barrel_has_data)), false)
            ELSE COALESCE(((p.updated_at > (now() - '00:00:16'::interval)) AND p.chiller_has_data), false)
        END AS is_online,
    COALESCE(d.comp_1a_enabled, p.comp_1a_enabled) AS comp_1a_enabled,
    COALESCE(d.comp_1b_enabled, p.comp_1b_enabled) AS comp_1b_enabled,
    d.comp_1c_enabled,
    d.comp_2a_enabled,
    d.comp_2b_enabled,
    d.comp_2c_enabled,
    p.level_percent,
    p.has_error
   FROM ((slots s
     LEFT JOIN points_summary p ON ((p.asset_code = s.source_code)))
     LEFT JOIN dashboards d ON ((d.asset_code = s.source_code)));
