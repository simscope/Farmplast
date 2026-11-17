CREATE OR REPLACE FUNCTION ch1_private.exchange(m jsonb, discover boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare response jsonb; manifest jsonb; secret text; signed text; canonical text; job uuid;
begin
 if m is null or octet_length(m::text)>1024 or m->>'protocol' is distinct from '2'
 or coalesce(m->>'version','') !~ '^[A-Za-z0-9._-]{1,48}$' or coalesce(m->>'boot','') !~ '^[0-9a-f]{32}$'
 or coalesce(m->>'job','') !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'
 or coalesce(m->>'status','') not in ('idle','authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed')
 or coalesce(m->>'progress','') !~ '^(100|[0-9]{1,2})$' then raise exception 'Invalid metadata'; end if;
 job=nullif(m->>'job','')::uuid;
 if not discover and (job is null or not exists(select 1 from public.ch1_ota_jobs where id=job)) then raise exception 'Unknown job'; end if;
 response=public.ch1_device_sync(m->>'version',m->>'boot',job,m->>'status',(m->>'progress')::int);
 update public.ch1_ota_device set protocol=2 where id='ESP32-CH1';
 manifest=response->'o';
 if discover and manifest is not null and manifest<>'null'::jsonb then
  select url into signed from ch1_private.downloads where job_id=(manifest->>'id')::uuid and expires_at>now();
  select device_key into secret from ch1_private.config where singleton;
  if signed is null or secret is null then raise exception 'Download not provisioned'; end if;
  canonical=(manifest->>'id')||'|update|CH1-ESP32S3-v1|'||(manifest->>'version')||'|'||(manifest->>'sha256')||'|'||(manifest->>'size')||'|'||(manifest->>'expires');
  response=jsonb_set(response,'{o}',(manifest-'path')||jsonb_build_object('url',signed,'mac',encode(extensions.hmac(canonical,secret,'sha256'),'hex')));
 else response=response-'o'; end if;
 return response;
end $function$
