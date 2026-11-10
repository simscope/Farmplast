/*
 * Farmplast Pennsylvania - Climate Controller, revision MSI 2.0.0
 * ESP32-WROOM-32E-N4 / 4 MB Flash / one relay / two DS18B20 on 1-Wire.
 *
 * Required Arduino IDE libraries:
 *   ESP32 by Espressif Systems 3.3.x, OneWire, DallasTemperature, ArduinoJson 7.x
 *
 * Relay control is enabled by default in device_config.h at owner request.
 * Relay GPIO and polarity are installer-configurable; hardware mapping is not confirmed.
 * Real HTTPS backend/OTA require explicit provisioning, no demo credentials.
 */
#include <Arduino.h>
#include <memory>
#include <new>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <mbedtls/md.h>
#include <mbedtls/base64.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <esp_mac.h>
#include <time.h>
#include <math.h>
#include "device_config.h"
#include "ClimateLogic.h"

// Identity markers allow MSI to reject a binary built for another model/version.
extern "C" const char PA_CLIMATE_BUILD_VERSION[] __attribute__((used)) = "PA_CLIMATE_FW_VERSION=" FIRMWARE_VERSION;
extern "C" const char PA_CLIMATE_BUILD_MODEL[] __attribute__((used)) = "PA_CLIMATE_FW_MODEL=" FIRMWARE_MODEL;

namespace {
constexpr uint32_t SENSOR_PERIOD_MS = 5000;
constexpr uint32_t CONVERSION_TIME_MS = 800; // 12-bit DS18B20, 750 ms maximum
constexpr uint32_t DISCOVER_PERIOD_MS = 30000;
constexpr uint32_t STATUS_PERIOD_MS = 10000;
constexpr uint32_t CLOUD_PERIOD_MS = 20000;
constexpr uint32_t WIFI_RETRY_MS = 12000;
constexpr uint32_t MIN_RELAY_INTERVAL_MS = 60000;
constexpr float TEMPERATURE_MIN_F = -40.0f;
constexpr float TEMPERATURE_MAX_F = 176.0f;
constexpr float TARGET_MIN_F = 45.0f;
constexpr float TARGET_MAX_F = 90.0f;
constexpr float HYSTERESIS_F = 2.0f;
constexpr float DIFFERENCE_WARNING_F = 5.0f;
constexpr uint8_t MAX_DISCOVERY = 8;

Preferences nv;
OneWire bus(DS18B20_GPIO);
DallasTemperature thermometers(&bus);
DeviceAddress installed[2] = {{0}, {0}};
bool installedValid[2] = {false, false};
bool sensorOK[2] = {false, false};
float sensorF[2] = {NAN, NAN};
uint8_t missingScans[2] = {0, 0};
uint8_t lastDiscovered = 0;
bool conversionPending = false;
uint32_t conversionStarted = 0;
uint32_t lastConversionKick = 0;
uint32_t lastDiscovery = 0;
uint32_t lastStatus = 0;
uint32_t lastCloud = 0;
uint32_t lastWifiRetry = 0;
uint8_t healthySampleCount = 0;
bool bootCloudConfirmed = false;
bool heatOn = false;
bool manualHeat = false;
bool otaInProgress = false;
uint32_t lastHeatTransition = 0;
uint32_t revisionApplied = 0;
float setpointF = 72.0f;
ClimateLogic::Mode operatingMode = ClimateLogic::Mode::AUTO;
ClimateLogic::Result current{};
String deviceId;
String wifiSsid, wifiPassword, cloudExchangeUrl, cloudDeviceToken, cloudOtaHmacKey, cloudRootCaPem;
String incomingSerial;
bool isProvisioned = false;
String lastOtaJob;
String lastFailedOtaJob;
uint32_t lastFailedOtaAt = 0;
uint32_t bootNonce = 0;

bool elapsed(uint32_t last, uint32_t duration) { return (uint32_t)(millis() - last) >= duration; }
bool cloudReady() {
  return isProvisioned && wifiSsid.length() && cloudExchangeUrl.startsWith("https://") &&
    cloudDeviceToken.length() >= 32 && cloudRootCaPem.startsWith("-----BEGIN CERTIFICATE-----");
}

void readProvisioning() {
  isProvisioned = nv.getBool("provready", false);
  if (!isProvisioned) return;
  wifiSsid = nv.getString("wifissid", "");
  wifiPassword = nv.getString("wifipass", "");
  cloudExchangeUrl = nv.getString("cloudurl", "");
  cloudDeviceToken = nv.getString("cloudtoken", "");
  cloudOtaHmacKey = nv.getString("otakey", "");
  cloudRootCaPem = nv.getString("rootca", "");
  if (!cloudReady() || cloudOtaHmacKey.length() != 64) {
    isProvisioned = false;
    Serial.println("Provisioning invalid; Wi-Fi and cloud remain disabled");
  }
}

bool acceptProvisioning(const String &encoded) {
  if (isProvisioned || encoded.length() < 100 || encoded.length() > 10000) return false;
  const size_t capacity = 8192;
  std::unique_ptr<unsigned char[]> decoded(new (std::nothrow) unsigned char[capacity]);
  if (!decoded) return false;
  size_t decodedLength = 0;
  if (mbedtls_base64_decode(decoded.get(), capacity - 1, &decodedLength,
      reinterpret_cast<const unsigned char *>(encoded.c_str()), encoded.length()) != 0) return false;
  decoded[decodedLength] = 0;
  JsonDocument doc;
  if (deserializeJson(doc, reinterpret_cast<const char *>(decoded.get()), decodedLength) != DeserializationError::Ok) return false;
  if (!doc["device_id"].is<const char *>() || !doc["ssid"].is<const char *>() ||
      !doc["password"].is<const char *>() || !doc["exchange_url"].is<const char *>() ||
      !doc["token"].is<const char *>() || !doc["ota_hmac_key"].is<const char *>() ||
      !doc["root_ca_pem"].is<const char *>()) return false;
  const String id = doc["device_id"].as<String>();
  const String ssid = doc["ssid"].as<String>();
  const String pass = doc["password"].as<String>();
  const String url = doc["exchange_url"].as<String>();
  const String token = doc["token"].as<String>();
  const String otaKey = doc["ota_hmac_key"].as<String>();
  const String ca = doc["root_ca_pem"].as<String>();
  if (id != deviceId || ssid.isEmpty() || ssid.length() > 32 ||
      pass.length() < 8 || pass.length() > 63 || !url.startsWith("https://") ||
      !url.endsWith("/v1/exchange") || url.length() > 1024 || token.length() < 32 ||
      token.length() > 300 || otaKey.length() != 64 ||
      ca.length() < 100 || ca.length() > 3600 ||
      !ca.startsWith("-----BEGIN CERTIFICATE-----")) return false;
  for (unsigned i = 0; i < otaKey.length(); i++) {
    const char x = otaKey[i];
    if (!isxdigit(static_cast<unsigned char>(x))) return false;
  }
  // Flag is written LAST. A loss of power mid-provision keeps the board
  // in first-provisioning mode instead of starting with partial credentials.
  bool ok = nv.putString("wifissid", ssid) > 0 &&
    nv.putString("wifipass", pass) > 0 &&
    nv.putString("cloudurl", url) > 0 &&
    nv.putString("cloudtoken", token) > 0 &&
    nv.putString("otakey", otaKey) > 0 &&
    nv.putString("rootca", ca) > 0;
  if (!ok || !nv.putBool("provready", true)) return false;
  return true;
}

void pollProvisioning() {
  if (isProvisioned) return;
  while (Serial.available()) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n') {
      incomingSerial.trim();
      if (incomingSerial.startsWith("FP1:")) {
        if (acceptProvisioning(incomingSerial.substring(4))) {
          Serial.println("FP_PROVISION_OK");
          Serial.flush();
          delay(350);
          ESP.restart();
        } else Serial.println("FP_PROVISION_FAILED");
      }
      incomingSerial = "";
    } else if (c >= 32 && incomingSerial.length() < 10500) incomingSerial += c;
    else if (incomingSerial.length() >= 10500) incomingSerial = "";
  }
}

String addrHex(const uint8_t *p) {
  char output[17];
  for (int i = 0; i < 8; ++i) snprintf(output + i * 2, 3, "%02X", p[i]);
  output[16] = 0;
  return String(output);
}

bool parseAddr(const String &text, DeviceAddress out) {
  if (text.length() != 16) return false;
  for (int i = 0; i < 8; ++i) {
    char byteBuf[3] = {text.charAt(i * 2), text.charAt(i * 2 + 1), 0};
    if (!isxdigit(byteBuf[0]) || !isxdigit(byteBuf[1])) return false;
    out[i] = static_cast<uint8_t>(strtoul(byteBuf, nullptr, 16));
  }
  return out[0] == 0x28 && OneWire::crc8(out, 7) == out[7];
}

bool sameAddr(const uint8_t *a, const uint8_t *b) { return memcmp(a, b, 8) == 0; }
void persistAddress(int slot) {
  nv.putString(slot == 0 ? "rom0" : "rom1", addrHex(installed[slot]));
  Serial.printf("T%d assigned: %s\n", slot + 1, addrHex(installed[slot]).c_str());
}

void discoverDevices() {
  DeviceAddress found[MAX_DISCOVERY];
  uint8_t count = 0;
  uint8_t raw[8];
  bus.reset_search();
  while (bus.search(raw)) {
    if (raw[0] != 0x28 || OneWire::crc8(raw, 7) != raw[7]) continue;
    if (count < MAX_DISCOVERY) memcpy(found[count++], raw, 8);
  }
  bus.reset_search();
  for (int i = 0; i < count; ++i)
    for (int j = i + 1; j < count; ++j)
      if (memcmp(found[i], found[j], 8) > 0) {
        uint8_t swap[8];
        memcpy(swap, found[i], 8);
        memcpy(found[i], found[j], 8);
        memcpy(found[j], swap, 8);
      }
  lastDiscovered = count;
  bool used[MAX_DISCOVERY] = {false};
  for (int slot = 0; slot < 2; ++slot) {
    bool present = false;
    if (installedValid[slot]) {
      for (int j = 0; j < count; ++j) {
        if (sameAddr(installed[slot], found[j])) {
          used[j] = true; present = true; break;
        }
      }
    }
    missingScans[slot] = present ? 0 : static_cast<uint8_t>(min(255, missingScans[slot] + 1));
  }
  // New sensors are registered automatically. To avoid confusing intermittent
  // disconnection with replacement, a previously bound slot requires 3 misses.
  // If >2 devices are on the bus, extra sensors are never auto-enrolled.
  if (count <= 2) {
    for (int slot = 0; slot < 2; ++slot) {
      if (installedValid[slot] && missingScans[slot] < 3) continue;
      for (int j = 0; j < count; ++j) {
        if (used[j]) continue;
        memcpy(installed[slot], found[j], 8);
        installedValid[slot] = true;
        missingScans[slot] = 0;
        used[j] = true;
        persistAddress(slot);
        break;
      }
    }
  }
  for (int slot = 0; slot < 2; ++slot) {
    if (installedValid[slot]) thermometers.setResolution(installed[slot], 12);
  }
  if (count > 2) Serial.println("WARNING: more than 2 DS18B20; extra devices ignored");
  Serial.printf("DS18B20 discovery: %u device(s); T1=%s, T2=%s\n", count,
    installedValid[0] ? addrHex(installed[0]).c_str() : "UNBOUND",
    installedValid[1] ? addrHex(installed[1]).c_str() : "UNBOUND");
}

void writeRelay(bool desiredOn) {
  if (!RELAY_TESTED_AND_ENABLED) {
    heatOn = false;
    return;
  }
  digitalWrite(RELAY_GPIO, desiredOn == RELAY_ACTIVE_HIGH ? HIGH : LOW);
  heatOn = desiredOn;
  lastHeatTransition = millis();
  Serial.printf("HEAT OUTPUT: %s\n", desiredOn ? "ON" : "OFF");
}

void applyControl() {
  ClimateLogic::Input in{sensorOK[0], sensorF[0], sensorOK[1], sensorF[1],
    setpointF, HYSTERESIS_F, DIFFERENCE_WARNING_F, heatOn, operatingMode, manualHeat};
  current = ClimateLogic::evaluate(in);
  const bool desired = current.wantHeat && RELAY_TESTED_AND_ENABLED && !otaInProgress;
  if (desired == heatOn) return;
  // Fault, OFF or OTA must shut off immediately, no minimum run-time restriction.
  const bool emergencyOff = !desired && (!current.hasTemperature ||
        operatingMode == ClimateLogic::Mode::OFF || otaInProgress);
  if (emergencyOff || elapsed(lastHeatTransition, MIN_RELAY_INTERVAL_MS)) writeRelay(desired);
}

void requestSample() {
  thermometers.requestTemperatures(); // asynchronous (waitForConversion = false)
  conversionPending = true;
  conversionStarted = millis();
  lastConversionKick = millis();
}

bool sensorReading(const DeviceAddress address, float &outF) {
  if (!thermometers.isConnected(address)) return false;
  const float c = thermometers.getTempC(address);
  if (!isfinite(c) || c == DEVICE_DISCONNECTED_C || fabsf(c - 85.0f) < 0.001f) return false;
  const float f = c * 1.8f + 32.0f;
  if (f < TEMPERATURE_MIN_F || f > TEMPERATURE_MAX_F) return false;
  outF = f;
  return true;
}

void collectSample() {
  conversionPending = false;
  for (int i = 0; i < 2; ++i) {
    sensorOK[i] = installedValid[i] && sensorReading(installed[i], sensorF[i]);
    if (!sensorOK[i]) sensorF[i] = NAN;
  }
  applyControl();
  if (current.hasTemperature && healthySampleCount < 5) ++healthySampleCount;
  const String t1 = sensorOK[0] ? String(sensorF[0], 2) + "F" : "FAULT";
  const String t2 = sensorOK[1] ? String(sensorF[1], 2) + "F" : "FAULT";
  const String avg = current.hasTemperature ? String(current.averageF, 2) + "F" : "FAULT";
  Serial.printf("T1=%s  T2=%s  AVG=%s  target=%.1fF  heat=%s  %s%s\n",
    t1.c_str(), t2.c_str(), avg.c_str(), setpointF, heatOn ? "ON" : "OFF",
    current.degraded ? "SINGLE_SENSOR " : "",
    current.disagreement ? "SENSOR_DIFFERENCE" : "");
}

void connectWifi() {
  if (!isProvisioned || wifiSsid.isEmpty()) return;
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  lastWifiRetry = millis();
  Serial.println("Wi-Fi connection requested");
}

void initializeClock() { configTime(0, 0, "time.cloudflare.com", "pool.ntp.org"); }
bool clockReady() { return time(nullptr) > 1750000000; } // TLS validity requires current time

String lowerHex(const uint8_t *buf, size_t n) {
  static const char *hex = "0123456789abcdef";
  String out; out.reserve(n * 2);
  for (size_t i = 0; i < n; ++i) {
    out += hex[buf[i] >> 4]; out += hex[buf[i] & 15];
  }
  return out;
}

bool safeHex64(const String &v) {
  if (v.length() != 64) return false;
  for (size_t i = 0; i < 64; ++i) {
    char c = v[i]; if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  }
  return true;
}

// Constant-time comparison after strict lowercase-hex validation.
bool sameDigest(const String &a, const String &b) {
  if (!safeHex64(a) || !safeHex64(b)) return false;
  unsigned char diff = 0;
  for (int i = 0; i < 64; ++i) diff |= static_cast<unsigned char>(a[i] ^ b[i]);
  return diff == 0;
}

bool signedOtaValid(const String &model, const String &targetDevice,
                    const String &job, const String &version, const String &url,
                    const String &sha, const String &signature) {
  if (cloudOtaHmacKey.isEmpty() || model != FIRMWARE_MODEL || targetDevice != deviceId ||
      job.isEmpty() || job.length() > 64 || version.isEmpty() || version.length() > 64 ||
      url.length() > 1024 || !url.startsWith("https://") ||
      !safeHex64(sha) || !safeHex64(signature)) return false;
  const String message = "PA-OTA-V1\n" + targetDevice + "\n" + model + "\n" +
    job + "\n" + version + "\n" + url + "\n" + sha;
  uint8_t mac[32];
  const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!md || mbedtls_md_hmac(md,
       reinterpret_cast<const unsigned char *>(cloudOtaHmacKey.c_str()),
       cloudOtaHmacKey.length(),
       reinterpret_cast<const unsigned char *>(message.c_str()), message.length(), mac) != 0) return false;
  return sameDigest(lowerHex(mac, 32), signature);
}

bool streamSignedImage(const String &url, const String &expectedSHA) {
  WiFiClientSecure tls;
  tls.setCACert(cloudRootCaPem.c_str());
  HTTPClient request;
  request.setTimeout(12000);
  request.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!request.begin(tls, url)) return false;
  const int httpCode = request.GET();
  const int imageSize = request.getSize();
  const esp_partition_t *slot = esp_ota_get_next_update_partition(nullptr);
  if (httpCode != HTTP_CODE_OK || imageSize <= 0 || !slot ||
      static_cast<size_t>(imageSize) > slot->size) {
    Serial.printf("OTA rejected: HTTP=%d size=%d slot=%u\n", httpCode, imageSize,
      slot ? static_cast<unsigned>(slot->size) : 0);
    request.end();
    return false;
  }
  if (!Update.begin(imageSize, U_FLASH)) {
    Serial.printf("OTA Update.begin failed: %u\n", Update.getError());
    request.end();
    return false;
  }
  mbedtls_md_context_t digest;
  mbedtls_md_init(&digest);
  const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!md || mbedtls_md_setup(&digest, md, 0) != 0 || mbedtls_md_starts(&digest) != 0) {
    Update.abort(); mbedtls_md_free(&digest); request.end(); return false;
  }
  auto &stream = request.getStream();
  int remaining = imageSize;
  uint32_t lastProgress = millis();
  const uint32_t deadlineStart = millis();
  uint8_t buffer[1024];
  bool success = true;
  while (remaining > 0) {
    if (elapsed(deadlineStart, 180000) || elapsed(lastProgress, 15000) || WiFi.status() != WL_CONNECTED) {
      success = false; break;
    }
    int n = stream.available();
    if (n <= 0) { delay(10); continue; }
    if (n > remaining) n = remaining;
    if (n > static_cast<int>(sizeof(buffer))) n = sizeof(buffer);
    const int got = stream.read(buffer, n);
    if (got <= 0) continue;
    lastProgress = millis();
    if (mbedtls_md_update(&digest, buffer, got) != 0 ||
        Update.write(buffer, got) != static_cast<size_t>(got)) {
      success = false; break;
    }
    remaining -= got;
    delay(0);
  }
  unsigned char actual[32] = {0};
  if (success && mbedtls_md_finish(&digest, actual) != 0) success = false;
  mbedtls_md_free(&digest);
  request.end();
  if (!success || remaining != 0 || !sameDigest(lowerHex(actual, 32), expectedSHA)) {
    Serial.println("OTA aborted: download interrupted, SHA256 mismatch or flash write error");
    Update.abort(); return false;
  }
  if (!Update.end(true)) {
    Serial.printf("OTA finalize failed: %u\n", Update.getError());
    return false;
  }
  Serial.println("OTA installed and SHA256 verified");
  return true;
}

void processOta(JsonVariantConst ota) {
  if (!ota.is<JsonObjectConst>() || cloudOtaHmacKey.isEmpty() || otaInProgress) return;
  const String model = ota["model"] | "";
  const String target = ota["device_id"] | "";
  const String job = ota["job_id"] | "";
  const String version = ota["version"] | "";
  const String url = ota["url"] | "";
  const String sha = ota["sha256"] | "";
  const String mac = ota["hmac_sha256"] | "";
  if (version == FIRMWARE_VERSION || job == lastOtaJob) return;
  if (job == lastFailedOtaJob && !elapsed(lastFailedOtaAt, 600000)) return;
  if (!signedOtaValid(model, target, job, version, url, sha, mac)) {
    Serial.println("OTA request rejected: invalid target/manifest/HMAC"); return;
  }
  Serial.printf("OTA authorized: job=%s version=%s\n", job.c_str(), version.c_str());
  otaInProgress = true;
  applyControl(); // de-energize relay before blocking network download
  const bool installedOK = streamSignedImage(url, sha);
  otaInProgress = false;
  if (!installedOK) {
    lastFailedOtaJob = job;
    lastFailedOtaAt = millis();
    applyControl(); return;
  }
  nv.putString("otajob", job);
  nv.putString("otaver", version);
  nv.putBool("newota", true);
  delay(100);
  ESP.restart();
}

void applyDesired(JsonVariantConst desired) {
  if (!desired.is<JsonObjectConst>()) return;
  const uint32_t rev = desired["revision"] | 0U;
  if (rev <= revisionApplied) return;
  const float target = desired["target_f"] | NAN;
  const String mode = desired["mode"] | "";
  if (!isfinite(target) || target < TARGET_MIN_F || target > TARGET_MAX_F ||
      (mode != "AUTO" && mode != "MANUAL" && mode != "OFF")) {
    Serial.println("Cloud desired state rejected (invalid target/mode)"); return;
  }
  if (mode == "MANUAL" && !desired["manual_heat"].is<bool>()) return;
  setpointF = target;
  operatingMode = mode == "AUTO" ? ClimateLogic::Mode::AUTO :
                  mode == "OFF" ? ClimateLogic::Mode::OFF : ClimateLogic::Mode::MANUAL;
  manualHeat = mode == "MANUAL" && desired["manual_heat"].as<bool>();
  revisionApplied = rev;
  nv.putFloat("target", setpointF);
  nv.putUChar("mode", static_cast<uint8_t>(operatingMode));
  nv.putUInt("revision", revisionApplied);
  // A manual ON is not persisted; an uncommanded reboot always starts it OFF.
  applyControl();
  Serial.printf("Cloud revision %u accepted, target=%.1fF, mode=%s\n", revisionApplied,
    setpointF, mode.c_str());
}

void cloudExchange() {
  if (!cloudReady() || WiFi.status() != WL_CONNECTED || !clockReady()) return;
  JsonDocument tx;
  tx["protocol_version"] = 1;
  tx["device_id"] = deviceId;
  tx["model"] = FIRMWARE_MODEL;
  tx["firmware"] = FIRMWARE_VERSION;
  tx["boot_id"] = String(bootNonce, HEX);
  tx["zone_id"] = nullptr;  // mapping is stored in the backend
  if (sensorOK[0]) tx["sensor_1_f"] = sensorF[0]; else tx["sensor_1_f"] = nullptr;
  if (sensorOK[1]) tx["sensor_2_f"] = sensorF[1]; else tx["sensor_2_f"] = nullptr;
  if (current.hasTemperature) tx["temperature_f"] = current.averageF;
  else tx["temperature_f"] = nullptr;
  tx["sensor_count"] = (int)sensorOK[0] + (int)sensorOK[1];
  tx["sensor_1_rom"] = installedValid[0] ? addrHex(installed[0]) : "";
  tx["sensor_2_rom"] = installedValid[1] ? addrHex(installed[1]) : "";
  tx["target_f"] = setpointF;
  tx["mode"] = operatingMode == ClimateLogic::Mode::AUTO ? "AUTO" :
                operatingMode == ClimateLogic::Mode::OFF ? "OFF" : "MANUAL";
  tx["heat"] = heatOn;
  tx["relay_armed"] = (bool)RELAY_TESTED_AND_ENABLED;
  tx["degraded"] = current.degraded;
  tx["sensor_difference"] = current.disagreement;
  tx["revision"] = revisionApplied;
  tx["last_ota_job"] = lastOtaJob;
  tx["uptime_s"] = millis() / 1000;

  String serialized;
  serializeJson(tx, serialized);
  WiFiClientSecure tls;
  tls.setCACert(cloudRootCaPem.c_str());
  HTTPClient request;
  request.setTimeout(9000);
  request.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!request.begin(tls, cloudExchangeUrl)) return;
  request.addHeader("Content-Type", "application/json");
  request.addHeader("Authorization", String("Bearer ") + cloudDeviceToken);
  const int status = request.POST(serialized);
  if (status != HTTP_CODE_OK) {
    Serial.printf("Cloud exchange: HTTP=%d (local regulation continues)\n", status);
    request.end(); return;
  }
  const String body = request.getString();
  request.end();
  // Confirm a newly flashed OTA app only after real HTTPS exchange succeeds.
  if (nv.getBool("newota", false)) bootCloudConfirmed = true;
  if (body.length() > 4096) { Serial.println("Cloud response too large"); return; }
  JsonDocument rx;
  if (deserializeJson(rx, body) != DeserializationError::Ok) {
    Serial.println("Cloud response invalid JSON"); return;
  }
  applyDesired(rx["desired"]);
  processOta(rx["ota"]);
}

void maybeConfirmOta() {
#if defined(CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE) && CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE
  if (healthySampleCount < 2 || !bootCloudConfirmed) return;
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  if (running && esp_ota_get_state_partition(running, &state) == ESP_OK &&
      state == ESP_OTA_IMG_PENDING_VERIFY) {
    if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
      nv.putBool("newota", false);
      Serial.println("OTA confirmed after valid sensor measurements AND authenticated MSI exchange");
    }
  }
#endif
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(250);
  nv.begin("fpclimate", false);
  uint8_t mac[6] = {0};
  if (esp_read_mac(mac, ESP_MAC_WIFI_STA) != ESP_OK) {
    Serial.println("FAIL: could not read hardware MAC; cloud provisioning disabled");
    while (true) delay(1000);
  }
  char macId[30];
  snprintf(macId, sizeof(macId), "PA-CLIM-%02X%02X%02X%02X%02X%02X",
    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  deviceId = macId;
  bootNonce = esp_random();
  Serial.printf("Farmplast PA Climate v%s | %s | model %s\n",
     FIRMWARE_VERSION, deviceId.c_str(), FIRMWARE_MODEL);
  Serial.println("One ESP32, two DS18B20, one heating relay");
  if (!RELAY_TESTED_AND_ENABLED) Serial.println("RELAY LOCKED (test commissioning): no relay pin is driven");
  if (RELAY_TESTED_AND_ENABLED) {
    // Put the output latch into the OFF state before enabling the pad.
    digitalWrite(RELAY_GPIO, RELAY_ACTIVE_HIGH ? LOW : HIGH);
    pinMode(RELAY_GPIO, OUTPUT);
    digitalWrite(RELAY_GPIO, RELAY_ACTIVE_HIGH ? LOW : HIGH);
  }
  lastHeatTransition = millis() - MIN_RELAY_INTERVAL_MS;
  setpointF = nv.getFloat("target", 72.0f);
  if (!isfinite(setpointF) || setpointF < TARGET_MIN_F || setpointF > TARGET_MAX_F) setpointF = 72.0f;
  const uint8_t mode = nv.getUChar("mode", 0);
  operatingMode = mode <= 2 ? static_cast<ClimateLogic::Mode>(mode) : ClimateLogic::Mode::OFF;
  revisionApplied = nv.getUInt("revision", 0);
  lastOtaJob = nv.getString("otajob", "");
  readProvisioning();
  manualHeat = false;
  if (operatingMode == ClimateLogic::Mode::MANUAL) operatingMode = ClimateLogic::Mode::OFF;
  for (int slot = 0; slot < 2; ++slot)
    installedValid[slot] = parseAddr(nv.getString(slot == 0 ? "rom0" : "rom1", ""), installed[slot]);
  thermometers.begin();
  thermometers.setWaitForConversion(false);
  discoverDevices();
  lastDiscovery = millis();
  requestSample();
  if (isProvisioned) { connectWifi(); initializeClock(); }
  else Serial.println("PA_PROVISION_READY: connect USB–UART and run Add-ESP32 on MSI");
  Serial.println("READY: two sensors average; local control survives Wi-Fi outage");
}

void loop() {
  pollProvisioning();
  if (conversionPending && elapsed(conversionStarted, CONVERSION_TIME_MS)) {
    collectSample();
    maybeConfirmOta();
  }
  if (!conversionPending && elapsed(lastConversionKick, SENSOR_PERIOD_MS)) requestSample();
  if (!conversionPending && elapsed(lastDiscovery, DISCOVER_PERIOD_MS)) {
    lastDiscovery = millis();
    discoverDevices();
  }
  if (isProvisioned && WiFi.status() != WL_CONNECTED && elapsed(lastWifiRetry, WIFI_RETRY_MS))
    connectWifi();
  if (elapsed(lastCloud, CLOUD_PERIOD_MS)) {
    lastCloud = millis();
    cloudExchange();
  }
  if (elapsed(lastStatus, STATUS_PERIOD_MS)) {
    lastStatus = millis();
    Serial.printf("Status: WiFi=%s, cloud=%s, target=%.1fF, devices=%u, relay=%s\n",
      WiFi.status() == WL_CONNECTED ? "ON" : "OFF",
      cloudReady() ? "CONFIGURED" : "NOT_CONFIGURED", setpointF,
      lastDiscovered, RELAY_TESTED_AND_ENABLED ? (heatOn ? "ON" : "OFF") : "LOCKED");
  }
  delay(20);
}