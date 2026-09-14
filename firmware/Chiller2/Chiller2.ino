/* Derived from owner-confirmed CH2 production v2.0.3.
   PLC-only Ethernet and Wi-Fi Internet routing are preserved.
   Secure OTA replaces the legacy HTTPUpdate hook. One physical first flash required.
   Transmit eight raw values and seven status bits every 15 seconds. */

#include <Arduino.h>
#include "secrets.h"
#include <WiFi.h>
#include <ETH.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "ota_config.h"
#include "network_config.h"

#if __has_include(<esp_arduino_version.h>)
  #include <esp_arduino_version.h>
#endif

#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  #include <Network.h>
  #define CH2_HAS_NETWORK_MANAGER 1
#else
  #define CH2_HAS_NETWORK_MANAGER 0
#endif

// ======================================================
// FIRMWARE
// ======================================================
static const char* FIRMWARE_VERSION = CHILLER_OTA_VERSION;

// ======================================================
// WIFI -> INTERNET / SUPABASE
// ======================================================
// WIFI_SSID is defined in ignored secrets.h.
// WIFI_PASS is defined in ignored secrets.h.

// ======================================================
// SUPABASE
// ======================================================
static const char* SUPABASE_HOST = "eeobivvwjzakbweluwtm.supabase.co";

static const char* SUPABASE_RPC_URL =
  "https://eeobivvwjzakbweluwtm.supabase.co/rest/v1/rpc/ingest_ch2";

// IMPORTANT: Wi-Fi DHCP currently advertises DNS 192.168.1.1.
// But 192.168.1.1 is also the chiller PLC on the directly-connected
// Ethernet subnet, so that DNS address is hijacked by the PLC route.
// Use public DNS explicitly so Internet name resolution always leaves via Wi-Fi.
static const IPAddress INTERNET_DNS1(1, 1, 1, 1);
static const IPAddress INTERNET_DNS2(8, 8, 8, 8);

// SUPABASE_ANON_KEY is defined in ignored secrets.h.

static const char* DEVICE_CODE   = "ESP32-CH2-PLC";
// DEVICE_SECRET is defined in ignored secrets.h.

// ======================================================
// INTERNET OTA
// ======================================================
// This endpoint may return 404 until the Edge Function is deployed.
// That is harmless; telemetry continues normally.
static const unsigned long OTA_CHECK_INTERVAL_MS = 15000UL;

// ======================================================
// CHILLER PLC / MODBUS TCP
// ======================================================
static const IPAddress CHILLER_IP(192, 168, 1, 1);
static const uint16_t MODBUS_PORT = 502;
static const uint8_t  MODBUS_UNIT_ID = 1;

// ======================================================
// WT32-ETH01 / LAN8720
// ======================================================
#ifndef ETH_PHY_TYPE
  #define ETH_PHY_TYPE ETH_PHY_LAN8720
#endif

#ifndef ETH_PHY_ADDR
  #define ETH_PHY_ADDR 1
#endif

#ifndef ETH_PHY_MDC
  #define ETH_PHY_MDC 23
#endif

#ifndef ETH_PHY_MDIO
  #define ETH_PHY_MDIO 18
#endif

#ifndef ETH_PHY_POWER
  #define ETH_PHY_POWER 16
#endif

#ifndef ETH_CLK_MODE
  #define ETH_CLK_MODE ETH_CLOCK_GPIO0_IN
#endif

// Ethernet is a LOCAL PLC link only.
// NO gateway and NO DNS are intentionally configured here.
static IPAddress eth_local_ip(CHILLER_ETH_IP);
static IPAddress eth_gateway (0, 0, 0, 0);
static IPAddress eth_subnet  (255, 255, 255, 0);
static IPAddress eth_dns1    (0, 0, 0, 0);
static IPAddress eth_dns2    (0, 0, 0, 0);

// ======================================================
// TIMING
// ======================================================
static const unsigned long ETH_WAIT_TIMEOUT_MS        = 10000UL;
static const unsigned long WIFI_BOOT_WAIT_MS          = 12000UL;
static const unsigned long WIFI_RETRY_INTERVAL_MS     = 10000UL;

static const unsigned long MODBUS_CONNECT_TIMEOUT_MS  = 2500UL;
static const unsigned long MODBUS_RESPONSE_TIMEOUT_MS = 2500UL;

static const unsigned long POLL_INTERVAL_MS            = 2000UL;

// Old firmware: POST every 5 sec with ~68 readings.
// Secure firmware: POST every 15 sec with 15 readings plus compact boot metadata.
static const unsigned long POST_INTERVAL_MS            = 15000UL;

static const unsigned long NET_STATUS_INTERVAL_MS      = 60000UL;

// ======================================================
// GLOBALS
// ======================================================
WiFiClient modbusClient;

bool ethConnected  = false;
bool wifiConnected = false;
bool chillerOnline = false;

unsigned long lastPollMs       = 0;
unsigned long lastPostMs       = 0;
unsigned long lastWifiRetryMs  = 0;
unsigned long lastNetStatusMs  = 0;
unsigned long bootMs           = 0;
unsigned long lastOtaCheckMs   = 0;


uint16_t txId = 1;
uint8_t consecutivePostFailures = 0;

// ======================================================
// DECODED CH2 VALUES
// ======================================================
struct ChillerData {
  bool valid;

  bool systemRunning;

  bool comp1AEnabled;
  bool comp1BEnabled;
  bool comp1CEnabled;

  bool comp2AEnabled;
  bool comp2BEnabled;
  bool comp2CEnabled;

  uint16_t r40023;
  uint16_t r40024;
  uint16_t r40025;

  uint16_t r40051;
  uint16_t r40052;
  uint16_t r40056;
  uint16_t r40057;
  uint16_t r40061;

  float setpointF;
  float enteringFluidF;
  float leavingFluidF;
};

ChillerData ch = {};

// ======================================================
// NETWORK ROUTING
// ======================================================
void forceInternetToWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

#if CH2_HAS_NETWORK_MANAGER
  Network.setDefaultInterface(WiFi.STA);
#endif

  // Arduino-ESP32 3.x DNS is shared by the network stack.
  // Re-apply safe Internet DNS after Wi-Fi DHCP and after ETH.config().
  WiFi.setDNS(INTERNET_DNS1, INTERNET_DNS2);
}

void printNetworkStatus() {
  Serial.println("--------------- NETWORK ---------------");

  Serial.print("[ETH] link=");
  Serial.print(ethConnected ? "UP" : "DOWN");
  Serial.print(" ip=");
  Serial.print(ETH.localIP());
  Serial.print(" gw=");
  Serial.println(ETH.gatewayIP());

  Serial.print("[WIFI] status=");
  Serial.print(WiFi.status() == WL_CONNECTED ? "UP" : "DOWN");
  Serial.print(" ip=");
  Serial.print(WiFi.localIP());
  Serial.print(" gw=");
  Serial.print(WiFi.gatewayIP());
  Serial.print(" dns0=");
  Serial.print(WiFi.dnsIP(0));
  Serial.print(" dns1=");
  Serial.println(WiFi.dnsIP(1));

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] rssi=");
    Serial.print(WiFi.RSSI());
    Serial.print(" dBm channel=");
    Serial.print(WiFi.channel());
    Serial.print(" bssid=");
    Serial.print(WiFi.BSSIDstr());
    Serial.print(" mac=");
    Serial.print(WiFi.macAddress());
    Serial.print(" sleep=");
    Serial.println((int)WiFi.getSleep());
    IPAddress resolved;
    int dnsRc = Network.hostByName(SUPABASE_HOST, resolved);

    Serial.print("[DNS] ");
    Serial.print(SUPABASE_HOST);
    Serial.print(" -> ");

    if (dnsRc == 1) {
      Serial.println(resolved);
    } else {
      Serial.print("FAILED rc=");
      Serial.println(dnsRc);
    }
  }

  Serial.print("[SYS] heap=");
  Serial.print(ESP.getFreeHeap());
  Serial.print(" uptime_s=");
  Serial.println(millis() / 1000UL);

  Serial.println("---------------------------------------");
}

// ======================================================
// EVENTS
// ======================================================
void onEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_ETH_START:
      ETH.setHostname("wt32-ch2-plc");
      Serial.println("[ETH] Started");
      break;

    case ARDUINO_EVENT_ETH_CONNECTED:
      Serial.println("[ETH] Link UP");
      break;

    case ARDUINO_EVENT_ETH_GOT_IP:
      ethConnected = true;
      Serial.print("[ETH] IP=");
      Serial.print(ETH.localIP());
      Serial.print(" mask=");
      Serial.print(ETH.subnetMask());
      Serial.print(" gw=");
      Serial.println(ETH.gatewayIP());

      // Ethernet is local PLC only. Restore Wi-Fi default route + public DNS
      // because ETH static configuration can alter shared DNS state.
      forceInternetToWiFi();
      break;

    case ARDUINO_EVENT_ETH_DISCONNECTED:
      ethConnected = false;
      chillerOnline = false;
      modbusClient.stop();
      Serial.println("[ETH] Link DOWN");
      break;

    case ARDUINO_EVENT_ETH_STOP:
      ethConnected = false;
      chillerOnline = false;
      modbusClient.stop();
      Serial.println("[ETH] Stopped");
      break;

    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      wifiConnected = true;
      Serial.print("[WIFI] IP=");
      Serial.print(WiFi.localIP());
      Serial.print(" GW=");
      Serial.println(WiFi.gatewayIP());

      forceInternetToWiFi();
      break;

    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      wifiConnected = false;
      Serial.println("[WIFI] Disconnected");
      break;

    default:
      break;
  }
}

// ======================================================
// ETHERNET
// ======================================================
void startEthernet() {
  Serial.println("[ETH] Initializing LAN8720...");

  bool ok = ETH.begin(
    ETH_PHY_TYPE,
    ETH_PHY_ADDR,
    ETH_PHY_MDC,
    ETH_PHY_MDIO,
    ETH_PHY_POWER,
    ETH_CLK_MODE
  );

  if (!ok) {
    Serial.println("[ETH] ERROR: ETH.begin() failed");
    return;
  }

  delay(250);

  bool cfg = ETH.config(
    eth_local_ip,
    eth_gateway,
    eth_subnet,
    eth_dns1,
    eth_dns2
  );

  Serial.print("[ETH] Static local-only config: ");
  Serial.println(cfg ? "OK" : "FAILED");

  // ETH.config() can affect shared DNS state in Arduino-ESP32.
  // Immediately restore Wi-Fi as the Internet route and public DNS.
  forceInternetToWiFi();

  unsigned long start = millis();
  while (!ethConnected && (millis() - start < ETH_WAIT_TIMEOUT_MS)) {
    delay(100);
  }

  if (!ethConnected) {
    Serial.println("[ETH] WARNING: PLC Ethernet not ready yet");
  }
}

// ======================================================
// WIFI
// ======================================================
void beginWiFi() {
  Serial.print("[WIFI] Connecting to ");
  Serial.println(WIFI_SSID);

  // IMPORTANT: keep ESP32 Wi-Fi modem power-save disabled.
  // A/B testing on this WT32 showed rare long HTTPS stalls with power-save enabled.
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void waitWiFiAtBoot() {
  beginWiFi();

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED &&
         (millis() - start < WIFI_BOOT_WAIT_MS)) {
    delay(250);
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    forceInternetToWiFi();
    Serial.println("[WIFI] Ready");
  } else {
    wifiConnected = false;
    Serial.println("[WIFI] Not ready; loop will retry");
  }
}

void serviceWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    return;
  }

  wifiConnected = false;

  unsigned long now = millis();
  if (now - lastWifiRetryMs < WIFI_RETRY_INTERVAL_MS) {
    return;
  }

  lastWifiRetryMs = now;

  Serial.println("[WIFI] Retry...");
  WiFi.disconnect(false, false);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void hardRecoverWiFi() {
  Serial.println("[WIFI] HARD recovery");

  WiFi.disconnect(true, false);
  delay(500);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < WIFI_BOOT_WAIT_MS) {
    delay(250);
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    forceInternetToWiFi();
    Serial.println("[WIFI] HARD recovery OK");
  } else {
    wifiConnected = false;
    Serial.println("[WIFI] HARD recovery FAILED");
  }
}

// ======================================================
// MODBUS LOW LEVEL
// ======================================================
bool readBytesExact(Client& client, uint8_t* buf, size_t len, unsigned long timeoutMs) {
  size_t got = 0;
  unsigned long start = millis();

  while (got < len && millis() - start < timeoutMs) {
    while (client.available() && got < len) {
      int c = client.read();
      if (c >= 0) {
        buf[got++] = (uint8_t)c;
      }
    }
    delay(1);
  }

  return got == len;
}

bool ensureModbusConnected() {
  if (!ethConnected) {
    return false;
  }

  if (modbusClient.connected()) {
    return true;
  }

  modbusClient.stop();
  modbusClient.setTimeout(MODBUS_RESPONSE_TIMEOUT_MS / 1000UL);

  unsigned long start = millis();

  while (!modbusClient.connect(CHILLER_IP, MODBUS_PORT)) {
    if (millis() - start >= MODBUS_CONNECT_TIMEOUT_MS) {
      Serial.println("[MODBUS] Connect timeout");
      return false;
    }
    delay(100);
  }

  Serial.println("[MODBUS] Connected");
  return true;
}

bool modbusReadHoldingRegisters(
  uint8_t unitId,
  uint16_t startAddr,
  uint16_t quantity,
  uint16_t* outRegs
) {
  if (quantity == 0 || quantity > 125) {
    return false;
  }

  if (!ensureModbusConnected()) {
    return false;
  }

  uint16_t currentTx = txId++;
  if (txId == 0) txId = 1;

  uint8_t req[12];

  req[0]  = (currentTx >> 8) & 0xFF;
  req[1]  = currentTx & 0xFF;
  req[2]  = 0x00;
  req[3]  = 0x00;
  req[4]  = 0x00;
  req[5]  = 0x06;
  req[6]  = unitId;
  req[7]  = 0x03;
  req[8]  = (startAddr >> 8) & 0xFF;
  req[9]  = startAddr & 0xFF;
  req[10] = (quantity >> 8) & 0xFF;
  req[11] = quantity & 0xFF;

  while (modbusClient.available()) {
    modbusClient.read();
  }

  size_t written = modbusClient.write(req, sizeof(req));
  modbusClient.flush();

  if (written != sizeof(req)) {
    Serial.println("[MODBUS] Write failed");
    modbusClient.stop();
    return false;
  }

  uint8_t mbap[7];

  if (!readBytesExact(
        modbusClient,
        mbap,
        sizeof(mbap),
        MODBUS_RESPONSE_TIMEOUT_MS
      )) {
    Serial.println("[MODBUS] MBAP timeout");
    modbusClient.stop();
    return false;
  }

  uint16_t rxTxId     = ((uint16_t)mbap[0] << 8) | mbap[1];
  uint16_t protocolId = ((uint16_t)mbap[2] << 8) | mbap[3];
  uint16_t length     = ((uint16_t)mbap[4] << 8) | mbap[5];
  uint8_t  rxUnitId   = mbap[6];

  if (rxTxId != currentTx ||
      protocolId != 0 ||
      rxUnitId != unitId ||
      length < 3) {
    Serial.println("[MODBUS] Invalid MBAP");
    modbusClient.stop();
    return false;
  }

  uint16_t remaining = length - 1;

  if (remaining > 255) {
    modbusClient.stop();
    return false;
  }

  uint8_t pdu[255];

  if (!readBytesExact(
        modbusClient,
        pdu,
        remaining,
        MODBUS_RESPONSE_TIMEOUT_MS
      )) {
    Serial.println("[MODBUS] PDU timeout");
    modbusClient.stop();
    return false;
  }

  if (pdu[0] & 0x80) {
    Serial.print("[MODBUS] Exception=");
    if (remaining > 1) {
      Serial.println(pdu[1], HEX);
    } else {
      Serial.println("?");
    }
    return false;
  }

  if (pdu[0] != 0x03 || remaining < 2) {
    return false;
  }

  uint8_t byteCount = pdu[1];

  if (byteCount != quantity * 2) {
    Serial.println("[MODBUS] Byte count mismatch");
    return false;
  }

  for (uint16_t i = 0; i < quantity; i++) {
    outRegs[i] =
      ((uint16_t)pdu[2 + i * 2] << 8) |
      pdu[3 + i * 2];
  }

  return true;
}

// 40001-based register number -> Modbus zero-based address
uint16_t regAddress(uint16_t reg) {
  return reg - 40001;
}

// ======================================================
// POLL ONLY NEEDED CH2 DATA
// ======================================================
bool pollChiller() {
  // Only 17 registers are read total:
  // 40011..40013
  // 40023..40025
  // 40051..40061
  uint16_t status[3]  = {};
  uint16_t process[3] = {};
  uint16_t metrics[11] = {};

  bool ok = true;

  ok &= modbusReadHoldingRegisters(
    MODBUS_UNIT_ID,
    regAddress(40011),
    3,
    status
  );

  if (ok) {
    ok &= modbusReadHoldingRegisters(
      MODBUS_UNIT_ID,
      regAddress(40023),
      3,
      process
    );
  }

  if (ok) {
    ok &= modbusReadHoldingRegisters(
      MODBUS_UNIT_ID,
      regAddress(40051),
      11,
      metrics
    );
  }

  if (!ok) {
    ch.valid = false;
    chillerOnline = false;
    Serial.println("[POLL] FAILED");
    return false;
  }

  ch.valid = true;
  chillerOnline = true;

  ch.systemRunning = ((status[0] >> 14) & 0x01) != 0;

  ch.comp1AEnabled = ((status[1] >> 8)  & 0x01) != 0;
  ch.comp1BEnabled = ((status[1] >> 9)  & 0x01) != 0;
  ch.comp1CEnabled = ((status[1] >> 10) & 0x01) != 0;

  ch.comp2AEnabled = ((status[2] >> 8)  & 0x01) != 0;
  ch.comp2BEnabled = ((status[2] >> 9)  & 0x01) != 0;
  ch.comp2CEnabled = ((status[2] >> 10) & 0x01) != 0;

  ch.r40023 = process[0];
  ch.r40024 = process[1];
  ch.r40025 = process[2];

  ch.r40051 = metrics[0];
  ch.r40052 = metrics[1];

  // metrics[4] = R40055, intentionally ignored

  ch.r40056 = metrics[5];
  ch.r40057 = metrics[6];

  // metrics[7] = R40058, intentionally ignored
  // metrics[8] = R40059, intentionally ignored

  ch.r40061 = metrics[10];

  ch.setpointF      = ch.r40023 / 10.0f;
  ch.enteringFluidF = ch.r40024 / 10.0f;
  ch.leavingFluidF  = ch.r40025 / 10.0f;

  Serial.printf("[CHILLER] SP=%.1f IN=%.1f OUT=%.1f F1=%u F2=%u DEM=%u RUN=%u\n",
    ch.setpointF,ch.enteringFluidF,ch.leavingFluidF,ch.r40051,ch.r40052,ch.r40061,ch.systemRunning?1:0);

  return true;
}

// ======================================================
// JSON HELPERS
// ======================================================
bool chillerDeviceSync(bool updating);
#include "../common/ChillerOta.h"

void appendUIntReading(
  String& json,
  bool& first,
  const char* pointCode,
  uint32_t value
) {
  if (!first) json += ",";
  first = false;

  json += "{\"point_code\":\"";
  json += pointCode;
  json += "\",\"value_number\":";
  json += String(value);
  json += "}";
}

void appendBoolReading(
  String& json,
  bool& first,
  const char* pointCode,
  bool value
) {
  if (!first) json += ",";
  first = false;

  json += "{\"point_code\":\"";
  json += pointCode;
  json += "\",\"value_boolean\":";
  json += value ? "true" : "false";
  json += "}";
}

// ======================================================
// BUILD MINIMAL SUPABASE PAYLOAD
// ======================================================
String buildRpcBody() {
  String body;
  body.reserve(2200);

  body += "{\"payload\":{";
  body += "\"device_code\":\"";
  body += DEVICE_CODE;
  body += "\",";
  body += "\"device_secret\":\"";
  body += DEVICE_SECRET;
  body += "\",";
  body += "\"readings\":[";

  bool first = true;

  if (ch.valid) {
    // Only raw registers used by the current HMI.
    appendUIntReading(body, first, "CH2_R40023", ch.r40023);
    appendUIntReading(body, first, "CH2_R40024", ch.r40024);
    appendUIntReading(body, first, "CH2_R40025", ch.r40025);

    appendUIntReading(body, first, "CH2_R40051", ch.r40051);
    appendUIntReading(body, first, "CH2_R40052", ch.r40052);

    appendUIntReading(body, first, "CH2_R40056", ch.r40056);
    appendUIntReading(body, first, "CH2_R40057", ch.r40057);

    appendUIntReading(body, first, "CH2_R40061", ch.r40061);

    // Only booleans visible on HMI.
    appendBoolReading(body, first, "CH2_SYSTEM_RUNNING", ch.systemRunning);

    appendBoolReading(body, first, "CH2_COMP_1A_ENABLED", ch.comp1AEnabled);
    appendBoolReading(body, first, "CH2_COMP_1B_ENABLED", ch.comp1BEnabled);
    appendBoolReading(body, first, "CH2_COMP_1C_ENABLED", ch.comp1CEnabled);

    appendBoolReading(body, first, "CH2_COMP_2A_ENABLED", ch.comp2AEnabled);
    appendBoolReading(body, first, "CH2_COMP_2B_ENABLED", ch.comp2BEnabled);
    appendBoolReading(body, first, "CH2_COMP_2C_ENABLED", ch.comp2CEnabled);
  }


  body += "],\"gateway\":";
  body += chillerGatewayMetadata();
  body += "}}";

  return body;
}

void diagnoseInternet() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[DIAG] Wi-Fi is DOWN");
    return;
  }

  forceInternetToWiFi();

  Serial.print("[DIAG] WiFi IP=");
  Serial.print(WiFi.localIP());
  Serial.print(" GW=");
  Serial.print(WiFi.gatewayIP());
  Serial.print(" DNS0=");
  Serial.print(WiFi.dnsIP(0));
  Serial.print(" DNS1=");
  Serial.print(WiFi.dnsIP(1));
  Serial.print(" RSSI=");
  Serial.print(WiFi.RSSI());
  Serial.print("dBm CH=");
  Serial.print(WiFi.channel());
  Serial.print(" BSSID=");
  Serial.print(WiFi.BSSIDstr());
  Serial.print(" sleep=");
  Serial.println((int)WiFi.getSleep());

  // Test a generic Internet endpoint first.
  // 1.1.1.1:443 is Cloudflare and does not require DNS.
  {
    WiFiClient tcpInternet;
    IPAddress probeIp(1, 1, 1, 1);

    unsigned long t0 = millis();
    int ok = tcpInternet.connect(probeIp, 443, 3000);
    unsigned long dt = millis() - t0;

    Serial.printf(
      "[DIAG] WAN TCP 1.1.1.1:443 -> %s ms=%lu\n",
      ok ? "OK" : "FAILED",
      dt
    );

    tcpInternet.stop();
  }

  IPAddress resolved;
  unsigned long dnsStart = millis();
  int dnsRc = Network.hostByName(SUPABASE_HOST, resolved);
  unsigned long dnsMs = millis() - dnsStart;

  if (dnsRc != 1) {
    Serial.printf("[DIAG] DNS FAILED rc=%d ms=%lu\n", dnsRc, dnsMs);
    return;
  }

  Serial.print("[DIAG] DNS OK ");
  Serial.print(SUPABASE_HOST);
  Serial.print(" -> ");
  Serial.print(resolved);
  Serial.print(" ms=");
  Serial.println(dnsMs);

  WiFiClient tcp;
  unsigned long tcpStart = millis();
  int tcpOk = tcp.connect(resolved, 443, 3000);
  unsigned long tcpMs = millis() - tcpStart;

  Serial.printf(
    "[DIAG] SUPABASE TCP %s:443 -> %s ms=%lu\n",
    resolved.toString().c_str(),
    tcpOk ? "OK" : "FAILED",
    tcpMs
  );

  tcp.stop();
}

// ======================================================
// SUPABASE POST
// ======================================================
bool postToSupabase() {
  if (!ch.valid || time(nullptr)<1700000000) return false;
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[POST] Skip: Wi-Fi offline");
    return false;
  }

  forceInternetToWiFi();

  WiFiClientSecure client;
  client.setCACert(CHILLER_OTA_CA_PEM);
  client.setTimeout(8000);

  HTTPClient http;

  http.setReuse(false);
  http.setConnectTimeout(5000);
  http.setTimeout(8000);

  if (!http.begin(client, SUPABASE_RPC_URL)) {
    Serial.println("[POST] http.begin FAILED");
    client.stop();
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader(
    "Authorization",
    "Bearer " + String(SUPABASE_ANON_KEY)
  );

  // Ask PostgREST for the smallest practical response.
  http.addHeader("Prefer", "return=minimal");
  http.addHeader("Connection", "close");

  String body = buildRpcBody();

  unsigned long started = millis();
  int code = http.POST(body);
  unsigned long elapsed = millis() - started;

  bool ok = code >= 200 && code < 300;

  if (ok) {
    chillerTelemetryPublished();
    Serial.printf(
      "[POST] OK code=%d bytes=%u ms=%lu\n",
      code,
      (unsigned int)body.length(),
      elapsed
    );
  } else {
    Serial.printf(
      "[POST] FAIL code=%d (%s) bytes=%u ms=%lu\n",
      code,
      HTTPClient::errorToString(code).c_str(),
      (unsigned int)body.length(),
      elapsed
    );
  }

  // Do NOT download/print the RPC response body.
  // It is unnecessary telemetry egress.
  http.end();
  client.stop();

  if (!ok) {
    diagnoseInternet();
  }

  return ok;
}

void handlePostResult(bool ok) {
  if (ok) {
    if (consecutivePostFailures > 0) {
      Serial.println("[POST] Internet recovered");
    }
    consecutivePostFailures = 0;
    return;
  }

  if (consecutivePostFailures < 255) {
    consecutivePostFailures++;
  }

  Serial.print("[POST] Consecutive failures=");
  Serial.println(consecutivePostFailures);

  // Rebuild ONLY Wi-Fi. Do not reboot the ESP32 because Ethernet/Modbus
  // is independent and must keep monitoring the chiller even if Internet
  // or Supabase is unavailable.
  if (consecutivePostFailures == 2 ||
      (consecutivePostFailures > 2 && (consecutivePostFailures % 4) == 0)) {
    hardRecoverWiFi();
  }
}

// ======================================================
// INTERNET OTA
// ======================================================
void serviceOta() {
  chillerOtaRecoveryCheck();
  if (millis()-otaLastExchange>=OTA_CHECK_INTERVAL_MS) chillerDeviceSync(false);
}

// ======================================================
// SETUP
// ======================================================
void setup() {
  Serial.begin(115200);
  delay(800);

  bootMs = millis();
  chillerOtaInit();
  configTime(0,0,"time.cloudflare.com","pool.ntp.org");

  Serial.println();
  Serial.println("======================================================");
  Serial.println("WT32-ETH01 CHILLER 2 - MINIMAL TELEMETRY + RECOVERY");
  Serial.print  ("Firmware: ");
  Serial.println(FIRMWARE_VERSION);
  Serial.println("Ethernet -> PLC only");
  Serial.println("Wi-Fi    -> Supabase / OTA only (public DNS)");
  Serial.println("Supabase -> only HMI-visible values");
  Serial.println("======================================================");

  WiFi.onEvent(onEvent);

  // Wi-Fi first: establish the Internet route.
  waitWiFiAtBoot();

  // Ethernet second, but with NO gateway.
  startEthernet();

  // Re-assert Wi-Fi as default Internet route after Ethernet starts.
  forceInternetToWiFi();

  printNetworkStatus();

  // Get first PLC sample immediately.
  pollChiller();

  // Send first sample immediately if Internet is available.
  if (WiFi.status() == WL_CONNECTED) {
    handlePostResult(postToSupabase());
  }

  lastPollMs = millis();
  lastPostMs = millis();
}

// ======================================================
// LOOP
// ======================================================
void loop() {
  unsigned long now = millis();

  serviceWiFi();

  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollChiller();
  }

  if (now - lastPostMs >= POST_INTERVAL_MS) {
    lastPostMs = now;
    handlePostResult(postToSupabase());
  }

  if (now - lastNetStatusMs >= NET_STATUS_INTERVAL_MS) {
    lastNetStatusMs = now;
    printNetworkStatus();
  }

  serviceOta();

  delay(2);
}
