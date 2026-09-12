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

        IF v_point_code IS NULL OR v_point_code = '' THEN
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
