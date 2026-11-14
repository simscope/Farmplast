import test from 'node:test';
import assert from 'node:assert/strict';
import { toExistingPaClimateCard, fahrenheit } from './climateUiData.mjs';

function zone(first, second, avg, online=true) {
  return {
    id: 'pa-zone-1', name: 'Zone 1', online,
    desired: {target_f: 72, mode: 'AUTO', revision: 2},
    reported: {sensor_1_f:first, sensor_2_f:second, temperature_f:avg,
      mode:'AUTO',heat:true,degraded:first===null||second===null,
      sensor_difference:false, revision:2},
  };
}
test('main existing Temperature position is T1, Wi-Fi position becomes T2, heating uses average', () => {
  const d=toExistingPaClimateCard(zone(68,72,70));
  assert.equal(d.temperatureF,68);
  assert.equal(d.secondTemperatureF,72);
  assert.equal(d.controlAverageF,70);
  assert.equal(fahrenheit(d.secondTemperatureF),'72.0°F');
  assert.ok(!Object.keys(d).some(k=>/wifi|rssi|dbm/i.test(k)));
});
test('one missing sensor: no invented reading, average equals surviving sensor', () => {
  const d=toExistingPaClimateCard(zone(null,69,69));
  assert.equal(d.temperatureF,null);
  assert.equal(d.secondTemperatureF,69);
  assert.equal(d.controlAverageF,69);
  assert.equal(d.sensorWarning,true);
});
test('offline: do not display stale sensor values as live', () => {
  const d=toExistingPaClimateCard(zone(68,72,70,false));
  assert.equal(d.connection,'OFFLINE');
  assert.equal(d.temperatureF,null);
  assert.equal(d.secondTemperatureF,null);
  assert.equal(d.controlAverageF,null);
});
test('reject mismatched average rather than show false readings', () => {
  const d=toExistingPaClimateCard(zone(68,72,81));
  assert.equal(d.temperatureF,null);
  assert.equal(d.secondTemperatureF,null);
  assert.equal(d.controlAverageF,null);
});
test('zero readings are not mistaken for missing values', () => {
  const d=toExistingPaClimateCard(zone(0,2,1));
  assert.equal(d.temperatureF,0);
  assert.equal(d.secondTemperatureF,2);
  assert.equal(d.controlAverageF,1);
});
