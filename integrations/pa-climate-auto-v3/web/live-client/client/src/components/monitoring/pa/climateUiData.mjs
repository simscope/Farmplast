/**
 * Map MSI climate telemetry into the EXISTING PA Climate card.
 * Never replace the current card's markup, PIN, controls or styling.
 * Temperature (main position) = T1; old Wi-Fi dBm position = T2.
 * temperature_f is the server-verified average used by the controller.
 * Offline readings are null, never copied from the last known sample.
 */
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function toExistingPaClimateCard(zone) {
  const connected = zone?.online === true;
  const data = connected && zone?.reported && typeof zone.reported === 'object'
    ? zone.reported : null;
  const t1 = finite(data?.sensor_1_f);
  const t2 = finite(data?.sensor_2_f);
  const avg = finite(data?.temperature_f);
  const target = finite(zone?.desired?.target_f);
  const readingsValid = (t1 === null && t2 === null) ? avg === null
    : avg !== null && Math.abs(avg - (t1 !== null && t2 !== null ? (t1+t2)/2 : t1 ?? t2)) <= 0.25;
  return {
    id: zone?.id ?? '',
    name: zone?.name ?? zone?.id ?? '',
    connection: connected ? 'ONLINE' : 'OFFLINE',
    temperatureF: connected && readingsValid ? t1 : null,
    secondTemperatureF: connected && readingsValid ? t2 : null,
    controlAverageF: connected && readingsValid ? avg : null,
    targetF: target,
    mode: connected ? (data?.mode ?? null) : null,
    heatOn: connected ? data?.heat === true : null,
    sensorWarning: connected && data?.degraded === true,
    sensorDifference: connected && data?.sensor_difference === true,
    revision: connected ? data?.revision ?? null : null,
  };
}

export function fahrenheit(value) {
  return finite(value) === null ? '—' : `${value.toFixed(1)}°F`;
}
