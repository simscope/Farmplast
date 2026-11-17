CREATE OR REPLACE FUNCTION public.ingest_ch1(p_key text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare secret text; row jsonb; pid uuid; m jsonb; result jsonb;
begin
 select device_key into secret from ch1_private.config where singleton;
 if secret is null or p_key is null or extensions.digest(p_key,'sha256')<>extensions.digest(secret,'sha256') then raise exception 'Device authentication failed'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 19 or octet_length(p_rows::text)>32768 then raise exception 'Invalid telemetry'; end if;
 perform pg_catalog.pg_advisory_xact_lock(714001);
 for row in select value from jsonb_array_elements(p_rows) loop
  pid=(row->>'point_id')::uuid;
  if row->>'asset_id' is distinct from '4327afc7-a56b-4253-97c9-3de3632fb189'
  or row->>'device_id' is distinct from 'db7a7808-8ceb-407a-bfbf-c215e42ffb93'
  or not exists(select 1 from public.v_asset_points_latest where asset_code='CH-NJ-01' and point_id=pid)
  then raise exception 'Wrong telemetry target'; end if;
  if pid='111996e4-ff83-4ad7-b4cd-233d326a30f7'::uuid then m=row->'raw_payload'->'gateway'; end if;
  insert into public.telemetry_latest(point_id,asset_id,device_id,value_number,value_boolean,value_text,quality,source_timestamp,updated_at,raw_payload)
  values(pid,(row->>'asset_id')::uuid,(row->>'device_id')::uuid,(row->>'value_number')::double precision,(row->>'value_boolean')::boolean,row->>'value_text',row->>'quality',(row->>'source_timestamp')::timestamptz,now(),row->'raw_payload')
  on conflict(point_id) do update set asset_id=excluded.asset_id,device_id=excluded.device_id,value_number=excluded.value_number,value_boolean=excluded.value_boolean,value_text=excluded.value_text,quality=excluded.quality,source_timestamp=excluded.source_timestamp,updated_at=excluded.updated_at,raw_payload=excluded.raw_payload;
 end loop;
 result=ch1_private.exchange(m,true);
 return result;
end $function$
