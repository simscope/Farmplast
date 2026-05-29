begin;

with inserted_asset as (
  insert into public.assets (
    asset_code,
    asset_name,
    asset_type,
    site_name,
    location_name,
    description,
    is_active
  )
  select
    'BARREL-NJ-02',
    'Material Barrel 2',
    'barrel',
    'Farmplast',
    'New Jersey',
    'ESP32 level monitoring 4-20mA',
    true
  where not exists (
    select 1 from public.assets where asset_code = 'BARREL-NJ-02'
  )
  returning id
),
barrel_asset as (
  select id from inserted_asset
  union all
  select id from public.assets where asset_code = 'BARREL-NJ-02'
  limit 1
),
inserted_device as (
  insert into public.devices (
    asset_id,
    device_code,
    device_name,
    device_type,
    communication_type,
    device_secret,
    is_active
  )
  select
    barrel_asset.id,
    'ESP32-BARREL2',
    'ESP32 Barrel 2',
    'esp32_local',
    'wifi',
    encode(gen_random_bytes(16), 'hex'),
    true
  from barrel_asset
  where not exists (
    select 1 from public.devices where device_code = 'ESP32-BARREL2'
  )
  returning id
),
barrel_device as (
  select id from inserted_device
  union all
  select id from public.devices where device_code = 'ESP32-BARREL2'
  limit 1
),
point_definitions (
  point_code,
  point_name,
  point_group,
  point_type,
  data_type,
  unit,
  source_type,
  source_address,
  display_order,
  is_required,
  is_active
) as (
  values
    ('BARREL2_DISTANCE_M', 'Distance to Material', 'level', 'analog', 'number', 'm', 'modbus_tcp', null, 1, true, true),
    ('BARREL2_LEVEL_M', 'Level', 'level', 'analog', 'number', 'm', 'modbus_tcp', null, 2, true, true),
    ('BARREL2_LEVEL_PERCENT', 'Level Percent', 'level', 'analog', 'number', '%', 'calculated', null, 3, true, true),
    ('BARREL2_SENSOR_TEMP_C', 'Sensor Temperature', 'temperature', 'temperature', 'number', 'C', 'modbus_tcp', null, 4, true, true),
    ('BARREL2_ERROR_CODE', 'Error Code', 'status', 'analog', 'number', 'code', 'modbus_tcp', null, 5, true, true),
    ('BARREL2_HAS_ERROR', 'Has Error', 'status', 'digital', 'boolean', null, 'calculated', null, 6, true, true),
    ('BARREL2_ONLINE', 'Barrel 2 Online', 'status', 'digital', 'boolean', null, 'calculated', null, 7, true, true)
)
insert into public.points (
  asset_id,
  device_id,
  point_code,
  point_name,
  point_group,
  point_type,
  data_type,
  unit,
  source_type,
  source_address,
  display_order,
  is_required,
  is_active
)
select
  barrel_asset.id,
  barrel_device.id,
  point_definitions.point_code,
  point_definitions.point_name,
  point_definitions.point_group,
  point_definitions.point_type,
  point_definitions.data_type,
  point_definitions.unit,
  point_definitions.source_type,
  point_definitions.source_address,
  point_definitions.display_order,
  point_definitions.is_required,
  point_definitions.is_active
from point_definitions
cross join barrel_asset
cross join barrel_device
where not exists (
  select 1
  from public.points
  where points.point_code = point_definitions.point_code
);

commit;
