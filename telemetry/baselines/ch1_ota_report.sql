CREATE OR REPLACE FUNCTION public.ch1_ota_report(p_key text, p_gateway jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare secret text;
begin
 select device_key into secret from ch1_private.config where singleton;
 if secret is null or p_key is null or extensions.digest(p_key,'sha256')<>extensions.digest(secret,'sha256') then raise exception 'Device authentication failed'; end if;
 return ch1_private.exchange(p_gateway,false);
end $function$
