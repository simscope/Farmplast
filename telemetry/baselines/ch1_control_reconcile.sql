CREATE OR REPLACE FUNCTION public.ch1_control_reconcile()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare metadata jsonb; actual jsonb; matched record;
begin
 select raw_payload->'gateway' into metadata from public.telemetry_latest where point_id='111996e4-ff83-4ad7-b4cd-233d326a30f7'::uuid and device_id='db7a7808-8ceb-407a-bfbf-c215e42ffb93'::uuid;
 select jsonb_object_agg(case point_code when 'CH1_AUTO' then 'auto' when 'CH1_FAN_ENABLE' then 'fan_enable' when 'CH1_FAN_30' then 'fan_30' when 'CH1_FAN_60' then 'fan_60' when 'CH1_SETPOINT' then 'setpoint' when 'CH1_D1' then 'd1' when 'CH1_D2' then 'd2' when 'CH1_HYST' then 'hyst' end,
 case when point_code in ('CH1_SETPOINT','CH1_D1','CH1_D2','CH1_HYST') then to_jsonb(value_number) else to_jsonb(value_boolean) end) into actual
 from public.v_asset_points_latest where asset_code='CH-NJ-01' and point_code in ('CH1_AUTO','CH1_FAN_ENABLE','CH1_FAN_30','CH1_FAN_60','CH1_SETPOINT','CH1_D1','CH1_D2','CH1_HYST');
 for matched in update public.ch1_control_commands c set status='applied',applied_at=now()
 where status='pending' and expires_at>now()
 and case when coalesce(metadata->>'command_revision','')~'^[0-9]+$' then (metadata->>'command_revision')::numeric>=c.revision else false end
 and ((command_type='reset_alert' and case when coalesce(metadata->>'reset_sequence','')~'^[0-9]+$' then (metadata->>'reset_sequence')::numeric>=c.reset_sequence else false end)
 or (command_type<>'reset_alert' and not exists(select 1 from jsonb_each(c.requested) x where
   case when jsonb_typeof(x.value)='number' then actual->>x.key is null or abs((actual->>x.key)::numeric-(x.value#>>'{}')::numeric)>0.05
   else actual->x.key is distinct from x.value end))) returning id,operator_id
 loop
   insert into public.ch1_ota_events(operator_id,event) values(matched.operator_id,'control_applied:'||matched.id::text);
 end loop;
 update public.ch1_control_commands set status='timeout' where status='pending' and expires_at<=now();
end $function$
