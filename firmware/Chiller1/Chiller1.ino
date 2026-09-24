#include "secrets.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>
#include <time.h>

bool ch1DeviceSync(bool updating = true);
bool ch1PostTelemetry(JsonArray rows, String& response);
bool ch1ProcessResponse(const String& response, bool updating);
String ch1GatewayMetadata();
void ch1TelemetryPublished();
bool ch1ConsumeResetSequence(uint32_t sequence);
uint32_t ch1CommandRevision=0, ch1ResetSequence=0, ch1RequestedResetSequence=0, ch1ReportedResetSequence=0;

// ======================================================
// WIFI
// ======================================================

// ======================================================
// SUPABASE
// ======================================================

// Telemetry and desired control/OTA response share one authenticated RPC.

// ======================================================
// IDENTIFIERS
// ======================================================
const char* ASSET_CODE  = "CH-NJ-01";
const char* DEVICE_CODE = "ESP32-CH1";

const char* ASSET_ID  = "4327afc7-a56b-4253-97c9-3de3632fb189";
const char* DEVICE_ID = "db7a7808-8ceb-407a-bfbf-c215e42ffb93";

// ======================================================
// POINT IDS FROM telemetry_latest
// ======================================================
const char* PID_CH1_CDW_OUT     = "18ccc8fe-9e7b-4d90-b8ef-e84a35458183";
const char* PID_CH1_CDW_IN      = "f727eb7e-a071-4933-9e4f-25deb3595054";
const char* PID_CH1_CHW_IN      = "c6b14e36-c3d8-41bb-9e16-cbbafaaada17";
const char* PID_CH1_CHW_OUT     = "e1b2517e-41d7-4499-8fec-866b5c4d5ce2";

const char* PID_CH1_COMP1       = "829b2e01-b023-47d4-8601-b6a9db49b10a";
const char* PID_CH1_COMP2       = "85ca770b-7600-4e9b-975f-41fafb7099cc";
const char* PID_CH1_ALARM       = "f61b7f7f-704a-4a83-8cfb-42fee73f8e77";

const char* PID_CH1_FAN_ENABLE  = "b39efd27-f542-441c-a1af-eb59206536a8";
const char* PID_CH1_FAN_30      = "6e8e6326-95e8-47c8-9bc4-f2a68861d9df";
const char* PID_CH1_FAN_60      = "32fe2b00-aa40-4a22-a5d2-3938caa37746";
const char* PID_CH1_RESET       = "5639737e-7b96-44f2-b721-fd865bb52112";

const char* PID_CH1_SETPOINT    = "ab3ff6eb-b0a8-4083-9f1b-e705a0e5cd8d";
const char* PID_CH1_D1          = "745fbfed-9ecb-4f71-896f-19ecbb4fe659";
const char* PID_CH1_D2          = "1ee0e78d-7903-4d01-8377-9917aeca12d6";
const char* PID_CH1_HYST        = "e3b40fa9-3c63-4792-bd2d-42991044fdce";

const char* PID_CH1_AUTO        = "b049389c-15a0-4c53-ab98-db1fee78a14c";
const char* PID_CH1_STAGE30     = "793d1dd9-631f-4561-9e44-64240ca75bc1";
const char* PID_CH1_STAGE60     = "18a2b087-0764-44d2-a9ac-bf7d52ee8165";
const char* PID_CH1_ONLINE      = "111996e4-ff83-4ad7-b4cd-233d326a30f7";

// ======================================================
// HARDWARE PINS
// Waveshare ESP32-S3-Relay-6CH
// ======================================================
static const int RELAY_FAN_ENABLE = 1;
static const int RELAY_FAN_30HZ   = 2;
static const int RELAY_FAN_60HZ   = 41;
static const int RELAY_RESET      = 42;

static const int PIN_ONEWIRE = 8;
static const int PIN_COMP1   = 7;
static const int PIN_COMP2   = 15;
static const int PIN_ALARM   = 16;

// ======================================================
// IO POLARITY
// ======================================================
const bool RELAY_ACTIVE_LOW = false;

const bool COMP_ACTIVE_WHEN_OPEN  = true;
const bool ALARM_ACTIVE_WHEN_OPEN = false;

// ======================================================
// TIMERS
// ======================================================
const unsigned long SENSOR_READ_MS   = 2000;
const unsigned long CLOUD_PUSH_MS    = 5000;
const unsigned long WIFI_RETRY_MS    = 10000;
const unsigned long RESET_PULSE_MS   = 10000;   // 10 секунд
const unsigned long PRINT_STATUS_MS  = 3000;

// ======================================================
// DS18B20
// ======================================================
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds(&oneWire);

DeviceAddress dsAddr[4];
bool dsFound[4] = {false, false, false, false};

float tempCDWOut = NAN;
float tempCDWIn  = NAN;
float tempCHWIn  = NAN;
float tempCHWOut = NAN;

// ======================================================
// CLOUD SETTINGS / COMMANDS
// ======================================================
float cloudSetpoint = 85.0f;
float cloudD1 = 2.0f;
float cloudD2 = 5.0f;
float cloudHyst = 1.0f;
bool  cloudAuto = true;

bool cloudManualFanEnable = false;
bool cloudManualFan30 = false;
bool cloudManualFan60 = false;
bool cloudResetCmd = false;
bool lastCloudResetCmd = false;

// ======================================================
// LIVE INPUT STATES
// ======================================================
bool comp1Run = false;
bool comp2Run = false;
bool alarmIn  = false;
bool onlineFlag = false;

// ======================================================
// OUTPUT STATES
// ======================================================
bool outFanEnable = false;
bool outFan30 = false;
bool outFan60 = false;
bool outReset = false;

// ======================================================
// STAGES
// ======================================================
enum Stage {
  STAGE_OFF = 0,
  STAGE_ENABLE_ONLY = 1,
  STAGE_30 = 2,
  STAGE_60 = 3
};

Stage autoStage = STAGE_OFF;

// ======================================================
// RESET PULSE
// ======================================================
bool resetPulseActive = false;
unsigned long resetPulseStartedAt = 0;

// ======================================================
// TIMESTAMP TRACKING
// ======================================================
unsigned long lastSensorReadAt   = 0;
unsigned long lastCloudPushAt    = 0;
unsigned long lastWifiRetryAt    = 0;
unsigned long lastStatusPrintAt  = 0;

// ======================================================
// HELPERS
// ======================================================
String boolToJson(bool v) {
  return v ? "true" : "false";
}

String jsonEscape(const String& s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    switch (c) {
      case '\"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default: out += c; break;
    }
  }
  return out;
}

float cToF(float c) {
  return (c * 9.0f / 5.0f) + 32.0f;
}

bool isValidTempC(float c) {
  return !(c == DEVICE_DISCONNECTED_C || isnan(c) || c < -55.0f || c > 125.0f);
}

void relayWrite(int pin, bool on) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(pin, on ? LOW : HIGH);
  } else {
    digitalWrite(pin, on ? HIGH : LOW);
  }
}

String getStageName(Stage s) {
  switch (s) {
    case STAGE_OFF: return "OFF";
    case STAGE_ENABLE_ONLY: return "ENABLE";
    case STAGE_30: return "30HZ";
    case STAGE_60: return "60HZ";
    default: return "OFF";
  }
}

String addressToString(const DeviceAddress addr) {
  char buf[24];
  snprintf(
    buf, sizeof(buf),
    "%02X%02X%02X%02X%02X%02X%02X%02X",
    addr[0], addr[1], addr[2], addr[3],
    addr[4], addr[5], addr[6], addr[7]
  );
  return String(buf);
}

String getIsoTimeUtc() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 1000)) {
    return "";
  }

  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

void syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  Serial.print("Syncing time");
  struct tm timeinfo;
  unsigned long start = millis();

  while (!getLocalTime(&timeinfo, 500) && millis() - start < 10000) {
    Serial.print(".");
  }

  Serial.println();

  if (getLocalTime(&timeinfo, 500)) {
    Serial.println("Time synced.");
  } else {
    Serial.println("Time sync failed.");
  }
}

// ======================================================
// WIFI
// ======================================================
void connectWiFi() {
  Serial.println();
  Serial.println("Connecting WiFi...");

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(300);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
    syncTime();
  } else {
    Serial.println("WiFi connect failed.");
  }
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastWifiRetryAt >= WIFI_RETRY_MS) {
    lastWifiRetryAt = now;
    connectWiFi();
  }
}

// ======================================================
// DS18B20
// ======================================================
void initDS18B20() {
  ds.begin();
  ds.setWaitForConversion(true);

  int foundCount = ds.getDeviceCount();
  Serial.print("DS18B20 found total: ");
  Serial.println(foundCount);

  for (int i = 0; i < 4; i++) {
    if (ds.getAddress(dsAddr[i], i)) {
      dsFound[i] = true;
      Serial.print("T");
      Serial.print(i + 1);
      Serial.print(" addr = ");
      Serial.println(addressToString(dsAddr[i]));
    } else {
      dsFound[i] = false;
      Serial.print("T");
      Serial.print(i + 1);
      Serial.println(" not found");
    }
  }
}

void readTemperatures() {
  ds.requestTemperatures();

  float t[4] = {NAN, NAN, NAN, NAN};

  for (int i = 0; i < 4; i++) {
    if (dsFound[i]) {
      float c = ds.getTempC(dsAddr[i]);
      if (isValidTempC(c)) {
        t[i] = cToF(c);
      }
    }
  }

  tempCDWOut = t[0];
  tempCDWIn  = t[1];
  tempCHWIn  = t[2];
  tempCHWOut = t[3];

  Serial.printf("T1 CDW_OUT: %.2f F\n", tempCDWOut);
  Serial.printf("T2 CDW_IN : %.2f F\n", tempCDWIn);
  Serial.printf("T3 CHW_IN : %.2f F\n", tempCHWIn);
  Serial.printf("T4 CHW_OUT: %.2f F\n", tempCHWOut);
}

// ======================================================
// INPUTS
// ======================================================
void readInputs() {
  int rawComp1 = digitalRead(PIN_COMP1);
  int rawComp2 = digitalRead(PIN_COMP2);
  int rawAlarm = digitalRead(PIN_ALARM);

  comp1Run = COMP_ACTIVE_WHEN_OPEN ? (rawComp1 == HIGH) : (rawComp1 == LOW);
  comp2Run = COMP_ACTIVE_WHEN_OPEN ? (rawComp2 == HIGH) : (rawComp2 == LOW);
  alarmIn  = ALARM_ACTIVE_WHEN_OPEN ? (rawAlarm == HIGH) : (rawAlarm == LOW);

  Serial.printf("RAW COMP1=%d COMP2=%d ALARM=%d\n", rawComp1, rawComp2, rawAlarm);
  Serial.printf("COMP1=%d COMP2=%d ALARM=%d\n", comp1Run, comp2Run, alarmIn);
}

// ======================================================
// HTTP HELPERS
// ======================================================
// ======================================================
// CLOUD FETCH
// ======================================================
void parseCloudRow(JsonObject row) {
  String pointCode = row["point_code"] | "";

  if (pointCode == "CH1_SETPOINT" && !row["value_number"].isNull()) {
    cloudSetpoint = row["value_number"].as<float>();
  } else if (pointCode == "CH1_D1" && !row["value_number"].isNull()) {
    cloudD1 = row["value_number"].as<float>();
  } else if (pointCode == "CH1_D2" && !row["value_number"].isNull()) {
    cloudD2 = row["value_number"].as<float>();
  } else if (pointCode == "CH1_HYST" && !row["value_number"].isNull()) {
    cloudHyst = row["value_number"].as<float>();
  } else if (pointCode == "CH1_AUTO" && !row["value_boolean"].isNull()) {
    cloudAuto = row["value_boolean"].as<bool>();
  } else if (pointCode == "CH1_FAN_ENABLE" && !row["value_boolean"].isNull()) {
    cloudManualFanEnable = row["value_boolean"].as<bool>();
  } else if (pointCode == "CH1_FAN_30" && !row["value_boolean"].isNull()) {
    cloudManualFan30 = row["value_boolean"].as<bool>();
  } else if (pointCode == "CH1_FAN_60" && !row["value_boolean"].isNull()) {
    cloudManualFan60 = row["value_boolean"].as<bool>();
  } else if (pointCode == "CH1_RESET" && !row["value_boolean"].isNull()) {
    cloudResetCmd = row["value_boolean"].as<bool>();
  }
}

// ======================================================
// CONTROL LOGIC
// ======================================================
void applyAutoStageLogic() {
  if (isnan(tempCDWOut)) {
    autoStage = STAGE_OFF;
    outFanEnable = false;
    outFan30 = false;
    outFan60 = false;
    return;
  }

  float sp   = cloudSetpoint;
  float d1   = cloudD1;
  float d2   = cloudD2;
  float hyst = cloudHyst;
  float t    = tempCDWOut;

  switch (autoStage) {
    case STAGE_OFF:
      if (t >= sp) {
        autoStage = STAGE_ENABLE_ONLY;
      }
      break;

    case STAGE_ENABLE_ONLY:
      if (t >= (sp + d2)) {
        autoStage = STAGE_60;
      } else if (t >= (sp + d1)) {
        autoStage = STAGE_30;
      } else if (t < (sp - hyst)) {
        autoStage = STAGE_OFF;
      }
      break;

    case STAGE_30:
      if (t >= (sp + d2)) {
        autoStage = STAGE_60;
      } else if (t < ((sp + d1) - hyst)) {
        autoStage = STAGE_ENABLE_ONLY;
      }
      break;

    case STAGE_60:
      if (t < ((sp + d2) - hyst)) {
        autoStage = STAGE_30;
      }
      break;
  }

  outFanEnable = (autoStage != STAGE_OFF);
  outFan30     = (autoStage == STAGE_30);
  outFan60     = (autoStage == STAGE_60);
}

void applyManualLogic() {
  bool fan60 = cloudManualFan60;
  bool fan30 = cloudManualFan30;

  if (fan60) fan30 = false;

  outFanEnable = cloudManualFanEnable || fan30 || fan60;
  outFan30 = fan30;
  outFan60 = fan60;
}

void handleResetCommand() {
  // Each server reset sequence is consumed durably once; a new reset waits for the
  // existing 10-second pulse to finish. The edge input returns false between pulses.
  cloudResetCmd = false;
  if (!resetPulseActive && ch1RequestedResetSequence > ch1ResetSequence && ch1ConsumeResetSequence(ch1RequestedResetSequence)) {
    ch1ResetSequence=ch1RequestedResetSequence;
    cloudResetCmd=true;
    Serial.printf("RESET sequence=%lu accepted\n",(unsigned long)ch1ResetSequence);
  }
  // RESET срабатывает только по новому TRUE, а не бесконечно
  if (cloudResetCmd && !lastCloudResetCmd && !resetPulseActive) {
    resetPulseActive = true;
    resetPulseStartedAt = millis();
    Serial.println("RESET pulse started for 10 seconds.");
  }

  lastCloudResetCmd = cloudResetCmd;

  if (resetPulseActive) {
    if (millis() - resetPulseStartedAt >= RESET_PULSE_MS) {
      resetPulseActive = false;
      outReset = false;
      Serial.println("RESET pulse finished.");
    } else {
      outReset = true;
    }
  } else {
    outReset = false;
  }
}

void updateOutputsLogic() {
  if (cloudAuto) {
    applyAutoStageLogic();
  } else {
    applyManualLogic();
  }

  handleResetCommand();

  relayWrite(RELAY_FAN_ENABLE, outFanEnable);
  relayWrite(RELAY_FAN_30HZ,   outFan30);
  relayWrite(RELAY_FAN_60HZ,   outFan60);
  relayWrite(RELAY_RESET,      outReset);
  if(outReset) ch1ReportedResetSequence=ch1ResetSequence;
}

void printStatus() {
  Serial.printf("AUTO=%d STAGE=%s FAN_EN=%d FAN30=%d FAN60=%d RESET=%d\n",
                cloudAuto,
                getStageName(autoStage).c_str(),
                outFanEnable,
                outFan30,
                outFan60,
                outReset);
}

// ======================================================
// TELEMETRY LATEST PAYLOAD
// FIX: build JSON with ArduinoJson instead of manual String concatenation.
// Codex OTA/device-sync architecture is preserved.
// ======================================================

void mergeGatewayMetadata(JsonObject rawPayload) {
  const String metadata = ch1GatewayMetadata();
  if (metadata.length() == 0) return;
  JsonDocument metadataDoc;
  const DeserializationError err = deserializeJson(metadataDoc, metadata);
  if (err || !metadataDoc["gateway"].is<JsonObject>()) {
    rawPayload["ota_metadata_parse_error"] = true;
    Serial.println("WARNING: invalid optional gateway metadata omitted");
    return;
  }
  // Only the gateway namespace is permitted. Optional metadata cannot replace point values.
  rawPayload["gateway"].set(metadataDoc["gateway"]);
}

void appendLatestNumber(
  JsonArray rows,
  const char* pointId,
  const char* pointCode,
  float value,
  const String& isoTime
) {
  if (!isfinite(value)) return;

  JsonObject row = rows.createNestedObject();

  row["point_id"] = pointId;
  row["asset_id"] = ASSET_ID;
  row["device_id"] = DEVICE_ID;
  row["value_number"] = value;
  row["value_boolean"] = nullptr;
  row["value_text"] = nullptr;
  row["quality"] = "good";

  if (isoTime.length() > 0) {
    row["source_timestamp"] = isoTime;
    row["updated_at"] = isoTime;
  }

  JsonObject rawPayload = row.createNestedObject("raw_payload");
  JsonObject incoming = rawPayload.createNestedObject("incoming");

  incoming["point_code"] = pointCode;
  incoming["value_number"] = value;

  rawPayload["device_code"] = DEVICE_CODE;
}

void appendLatestBool(
  JsonArray rows,
  const char* pointId,
  const char* pointCode,
  bool value,
  const String& isoTime
) {
  JsonObject row = rows.createNestedObject();

  row["point_id"] = pointId;
  row["asset_id"] = ASSET_ID;
  row["device_id"] = DEVICE_ID;
  row["value_number"] = nullptr;
  row["value_boolean"] = value;
  row["value_text"] = nullptr;
  row["quality"] = "good";

  if (isoTime.length() > 0) {
    row["source_timestamp"] = isoTime;
    row["updated_at"] = isoTime;
  }

  JsonObject rawPayload = row.createNestedObject("raw_payload");

  // Keep OTA/device metadata on CH1_ONLINE, but merge parsed JSON safely.
  if (String(pointCode) == "CH1_ONLINE") {
    mergeGatewayMetadata(rawPayload);
  }

  JsonObject incoming = rawPayload.createNestedObject("incoming");

  incoming["point_code"] = pointCode;
  incoming["value_boolean"] = value;

  rawPayload["device_code"] = DEVICE_CODE;
}

String buildTelemetryLatestPayload() {
  String isoTime = getIsoTimeUtc();

  DynamicJsonDocument doc(32768);
  JsonArray rows = doc.to<JsonArray>();

  appendLatestNumber(rows, PID_CH1_CDW_OUT, "CH1_CDW_OUT", tempCDWOut, isoTime);
  appendLatestNumber(rows, PID_CH1_CDW_IN,  "CH1_CDW_IN",  tempCDWIn,  isoTime);
  appendLatestNumber(rows, PID_CH1_CHW_IN,  "CH1_CHW_IN",  tempCHWIn,  isoTime);
  appendLatestNumber(rows, PID_CH1_CHW_OUT, "CH1_CHW_OUT", tempCHWOut, isoTime);

  appendLatestBool(rows, PID_CH1_COMP1, "CH1_COMP1", comp1Run, isoTime);
  appendLatestBool(rows, PID_CH1_COMP2, "CH1_COMP2", comp2Run, isoTime);
  appendLatestBool(rows, PID_CH1_ALARM, "CH1_ALARM", alarmIn, isoTime);

  appendLatestBool(rows, PID_CH1_FAN_ENABLE, "CH1_FAN_ENABLE", outFanEnable, isoTime);
  appendLatestBool(rows, PID_CH1_FAN_30,     "CH1_FAN_30",     outFan30, isoTime);
  appendLatestBool(rows, PID_CH1_FAN_60,     "CH1_FAN_60",     outFan60, isoTime);
  appendLatestBool(rows, PID_CH1_RESET,      "CH1_RESET",      outReset, isoTime);

  appendLatestNumber(rows, PID_CH1_SETPOINT, "CH1_SETPOINT", cloudSetpoint, isoTime);
  appendLatestNumber(rows, PID_CH1_D1,       "CH1_D1",       cloudD1, isoTime);
  appendLatestNumber(rows, PID_CH1_D2,       "CH1_D2",       cloudD2, isoTime);
  appendLatestNumber(rows, PID_CH1_HYST,     "CH1_HYST",     cloudHyst, isoTime);

  appendLatestBool(rows, PID_CH1_AUTO,    "CH1_AUTO",    cloudAuto, isoTime);
  appendLatestBool(rows, PID_CH1_STAGE30, "CH1_STAGE30", autoStage == STAGE_30, isoTime);
  appendLatestBool(rows, PID_CH1_STAGE60, "CH1_STAGE60", autoStage == STAGE_60, isoTime);
  appendLatestBool(rows, PID_CH1_ONLINE,  "CH1_ONLINE",  onlineFlag, isoTime);

  if (doc.overflowed()) {
    Serial.println("ERROR: telemetry JSON document overflowed");
    return "";
  }

  String payload;
  payload.reserve(8192);
  serializeJson(doc, payload);

  return payload;
}

bool pushTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return false;
  String payload = buildTelemetryLatestPayload();
  JsonDocument rows;
  if (!payload.length() || deserializeJson(rows,payload) || !rows.is<JsonArray>()) return false;
  String response;
  if (!ch1PostTelemetry(rows.as<JsonArray>(),response)) return false;
  // Only an authenticated, valid ingestion response makes the new image healthy.
  if (!ch1ProcessResponse(response,false)) return false;
  ch1TelemetryPublished();
  return true;
}

// ======================================================
// SAFE BOOT
// ======================================================
void initOutputsSafe() {
  pinMode(RELAY_FAN_ENABLE, OUTPUT);
  pinMode(RELAY_FAN_30HZ, OUTPUT);
  pinMode(RELAY_FAN_60HZ, OUTPUT);
  pinMode(RELAY_RESET, OUTPUT);

  relayWrite(RELAY_FAN_ENABLE, false);
  relayWrite(RELAY_FAN_30HZ, false);
  relayWrite(RELAY_FAN_60HZ, false);
  relayWrite(RELAY_RESET, false);
}

// ======================================================
// SETUP / LOOP
// ======================================================
#include "Ch1Ota.h"

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println();
  Serial.println("BOOT OK - CH1 monitoring gateway / JSON FIX");

  pinMode(PIN_COMP1, INPUT_PULLUP);
  pinMode(PIN_COMP2, INPUT_PULLUP);
  pinMode(PIN_ALARM, INPUT_PULLUP);

  initOutputsSafe();
  ch1OtaInit();
  connectWiFi();
  initDS18B20();

  onlineFlag = (WiFi.status() == WL_CONNECTED);

  readTemperatures();
  readInputs();
  pushTelemetry();
  ch1OtaRunPending(); // All telemetry HTTP/TLS/JSON locals have been destroyed.
  printStatus();
}

void loop() {
  ch1OtaRecoveryCheck();
  ensureWiFi();
  onlineFlag = (WiFi.status() == WL_CONNECTED);

  unsigned long now = millis();

  if (now - lastSensorReadAt >= SENSOR_READ_MS) {
    lastSensorReadAt = now;
    readTemperatures();
    readInputs();
    updateOutputsLogic();
  }

  if (now - lastCloudPushAt >= CLOUD_PUSH_MS) {
    lastCloudPushAt = now;
    pushTelemetry();
    ch1OtaRunPending(); // Run only after the entire telemetry exchange returns.
  }

  if (now - lastStatusPrintAt >= PRINT_STATUS_MS) {
    lastStatusPrintAt = now;
    printStatus();
  }

  delay(50);
}
