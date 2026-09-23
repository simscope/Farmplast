export const PA_CLIMATE_ZONE_CONFIG = Array.from({ length: 8 }, (_, index) => ({
  id: `pa-zone-${index + 1}`, name: `Zone ${index + 1}`, enabled: true,
  temperatureSensorId: null, humiditySensorId: null, controllerChannel: null,
  hvacEquipmentId: null, minSetpointF: null, maxSetpointF: null,
  highTemperatureF: null, lowTemperatureF: null,
  highHumidityPercent: null, lowHumidityPercent: null,
}))
