import { getAssetStatus, ONLINE_THRESHOLD_SEC } from './monitoringHelpers'

// Must match the presentation mapping in v_nj_monitoring_overview.
export const BARREL_SOURCE_CODES = { 1: 'BARREL-NJ-02', 2: 'BARREL-NJ-01' }

export function getBarrelStatus(asset) {
  const status = getAssetStatus(asset)
  const onlinePoint = asset?.points?.find(point => point.point_code.endsWith('_ONLINE'))
  const fresh = status.secondsAgo !== null && status.secondsAgo <= ONLINE_THRESHOLD_SEC
  return { ...status, online: fresh && (onlinePoint?.value_boolean ?? status.online) }
}
