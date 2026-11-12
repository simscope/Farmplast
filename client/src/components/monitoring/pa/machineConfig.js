// Inventory is independent of telemetry and gateway authentication identities.
export const PA_MACHINE_CONFIG = Array.from({ length: 4 }, (_, index) => ({
  id: `pa-machine-${index + 1}`, name: `Machine ${index + 1}`, enabled: true,
  meterAddress: null, nominalVoltage: null,
  activeCurrentThreshold: null, inactiveCurrentThreshold: null,
  activationDelaySec: null, shutdownDelaySec: null,
  activePowerThresholdKw: null, inactivePowerThresholdKw: null,
}))
