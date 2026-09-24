#pragma once
#include <Preferences.h>
#include <esp_ota_ops.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>
#if __has_include("ota_config.h")
#include "ota_config.h"
#else
#include "ota_config.example.h"
#endif

// OTA itself has no relay, operating-mode or service-state hooks.
#if CH1_OTA_ENABLED && !CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE
#error "CH1 OTA requires the rollback-enabled ESP32 core/bootloader configuration"
#endif
static const char ch1DeviceMarker[] = "CH1OTA_DEVICE=ESP32-CH1";
static const char ch1ModelMarker[] = "CH1OTA_MODEL=CH1-ESP32S3-v1";
static bool ch1HaveRevision=false;
static const char ch1VersionMarker[] = "CH1OTA_VERSION=" CH1_OTA_VERSION;
static Preferences otaPrefs;
static bool otaReady=false, otaSyncing=false, otaBootCheck=false, otaTelemetryHealthy=false;
static String otaJobId, otaTarget, otaPhase="idle", otaPrevious, otaBoot;
static int otaProgress=0;
static unsigned long otaBootStarted=0, otaLastExchange=0;
struct OtaJob { String id,version,sha,url; uint32_t size; int64_t expires; };

static String otaHex(const uint8_t* bytes,size_t count) {
  const char* digits="0123456789abcdef"; String value;value.reserve(count*2);
  for(size_t i=0;i<count;i++) {value+=digits[bytes[i]>>4];value+=digits[bytes[i]&15];}
  return value;
}
static bool otaSave() {
  if(!otaReady) return false;
  JsonDocument doc;doc["job"]=otaJobId;doc["target"]=otaTarget;doc["state"]=otaPhase;doc["previous"]=otaPrevious;
  String record;serializeJson(doc,record);
  // One atomic NVS value prevents partial job/phase writes from replaying an update.
  return otaPrefs.putString("record",record)==record.length();
}
bool ch1ConsumeResetSequence(uint32_t sequence) {
  return otaReady && otaPrefs.putUInt("reset_seq",sequence)==sizeof(uint32_t);
}
String ch1GatewayMetadata() {
  JsonDocument doc;JsonObject gateway=doc["gateway"].to<JsonObject>();
  gateway["protocol"]=2;gateway["status"]=otaPhase;gateway["progress"]=otaProgress;
  gateway["device"]=ch1DeviceMarker+14;gateway["model"]=ch1ModelMarker+13;
  gateway["version"]=ch1VersionMarker+15;gateway["boot"]=otaBoot;gateway["job"]=otaJobId;
  gateway["command_revision"]=ch1CommandRevision;
  gateway["reset_sequence"]=ch1ReportedResetSequence;
  String result;serializeJson(doc,result);return result;
}
void ch1TelemetryPublished() {
  if(otaBootCheck) {
    esp_ota_img_states_t state;
    if(esp_ota_get_state_partition(esp_ota_get_running_partition(),&state)==ESP_OK && state==ESP_OTA_IMG_PENDING_VERIFY)
      if(esp_ota_mark_app_valid_cancel_rollback()!=ESP_OK) return;
    otaBootCheck=false;
  }
  otaTelemetryHealthy=true;
}
static void otaApplyValues(JsonArray values) {
  // Positional contract: same nine values consumed by the original sketch. Missing values
  // retain prior values, as before. OTA does not add an output-state or command interlock.
  const char* codes[]={"CH1_SETPOINT","CH1_D1","CH1_D2","CH1_HYST","CH1_AUTO","CH1_FAN_ENABLE","CH1_FAN_30","CH1_FAN_60","CH1_RESET"};
  if(values.size()!=9) return;
  for(int i=0;i<9;i++) {
    JsonDocument row;row["point_code"]=codes[i];
    if(i<4 && values[i].is<float>() && isfinite(values[i].as<float>())) row["value_number"]=values[i];
    else if(i>=4 && values[i].is<bool>()) row["value_boolean"]=values[i];
    parseCloudRow(row.as<JsonObject>());
  }
}
static bool otaDecode(JsonObject doc,OtaJob& job) {
  String action=doc["action"]|"",model=doc["model"]|"",mac=doc["mac"]|"";
  job.id=doc["id"]|"";job.version=doc["version"]|"";job.sha=doc["sha256"]|"";job.url=doc["url"]|"";
  job.expires=doc["expires"]|int64_t(0);job.size=doc["size"]|uint32_t(0);
  if(job.id.length()!=36 || model!="CH1-ESP32S3-v1" || action!="update" || job.expires<=time(nullptr) || job.expires>time(nullptr)+660 || job.version.length()>48 || job.url.length()>2048) return false;
  if(job.sha.length()!=64 || !job.size || job.size>1310720 || !job.version.length() || job.version==ch1VersionMarker+15 || !job.url.startsWith(String(SUPABASE_URL)+"/storage/v1/object/sign/ch1-firmware/")) return false;
  String canonical=job.id+"|update|"+model+"|"+job.version+"|"+job.sha+"|"+String(job.size)+"|"+String((long long)job.expires);
  uint8_t digest[32];
  if(mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),(const uint8_t*)CH1_OTA_DEVICE_KEY,strlen(CH1_OTA_DEVICE_KEY),(const uint8_t*)canonical.c_str(),canonical.length(),digest)) return false;
  String expected=otaHex(digest,32);unsigned diff=mac.length()^expected.length();
  for(unsigned i=0;i<expected.length();i++) diff|=expected[i]^(i<mac.length()?mac[i]:0);
  return diff==0;
}
static bool otaStage(const char* phase,int progress) {
  otaPhase=phase;otaProgress=progress;
  if(!otaSave()) return false;
  return ch1DeviceSync(true) && otaPhase!="failed";
}
static bool otaInstall(const OtaJob& job) {
  const esp_partition_t* slot=esp_ota_get_next_update_partition(nullptr);
  if(!slot || slot==esp_ota_get_running_partition() || job.size>slot->size || job.expires<=time(nullptr)) return false;
  if(!otaStage("downloading",0)) return false;
  WiFiClientSecure tls;tls.setCACert(CH1_OTA_CA_PEM);
  HTTPClient http;http.setTimeout(10000);http.setConnectTimeout(5000);
  if(!http.begin(tls,job.url)) return false;
  if(http.GET()!=200 || http.getSize()!=int(job.size)) {http.end();return false;}
  esp_ota_handle_t handle;
  if(esp_ota_begin(slot,job.size,&handle)!=ESP_OK) {http.end();return false;}
  mbedtls_sha256_context sha;mbedtls_sha256_init(&sha);mbedtls_sha256_starts(&sha,0);
  auto stream=http.getStreamPtr();uint8_t buffer[1024];uint32_t remaining=job.size,lastData=millis();bool ok=true;
  while(remaining) {
    if(time(nullptr)>=job.expires || millis()-lastData>15000 || otaPhase=="failed") {ok=false;break;}
    size_t available=stream->available();
    if(available) {
      size_t count=stream->readBytes(buffer,std::min(size_t(remaining),std::min(available,sizeof(buffer))));
      if(!count || esp_ota_write(handle,buffer,count)!=ESP_OK) {ok=false;break;}
      mbedtls_sha256_update(&sha,buffer,count);remaining-=count;lastData=millis();
      otaProgress=int((uint64_t(job.size-remaining)*90)/job.size);
    }
    // The ordinary loop is suspended during the transfer. This uses its SAME device
    // exchange, at the same interval, rather than starting another polling task/timer.
    if(millis()-otaLastExchange>=CLOUD_PUSH_MS) ch1DeviceSync(true);
    delay(1);
  }
  uint8_t digest[32];mbedtls_sha256_finish(&sha,digest);mbedtls_sha256_free(&sha);http.end();
  if(!ok || !otaStage("verifying",90) || otaHex(digest,32)!=job.sha) {esp_ota_abort(handle);return false;}
  if(!otaStage("installing",95)) {esp_ota_abort(handle);return false;}
  // Bytes were staged only in the inactive slot; installation validates/activates it.
  if(esp_ota_end(handle)!=ESP_OK || job.expires<=time(nullptr)) return false;
  if(!otaStage("rebooting",99)) return false;
  if(esp_ota_set_boot_partition(slot)!=ESP_OK) return false;
  ESP.restart();return true;
}
static void otaRun(const OtaJob& job) {
  if(job.id==otaJobId || !otaReady) return;
  otaJobId=job.id;otaTarget=job.version;otaPrevious=esp_ota_get_running_partition()->label;
  if(otaStage("authorized",0) && otaInstall(job)) return;
  otaPhase="failed";otaSave();ch1DeviceSync(true);
  // Failure automatically returns to the normal sensor/publish loop on the running image.
}
static bool ch1Rpc(const char* endpoint,JsonDocument& doc,String& response) {
  if(WiFi.status()!=WL_CONNECTED || time(nullptr)<1700000000 || strlen(CH1_OTA_DEVICE_KEY)<32 || strlen(CH1_OTA_CA_PEM)<100) return false;
  doc["p_key"]=CH1_OTA_DEVICE_KEY;
  String body;serializeJson(doc,body);
  WiFiClientSecure tls;tls.setCACert(CH1_OTA_CA_PEM);
  HTTPClient http;http.setTimeout(10000);http.setConnectTimeout(5000);
  if(!http.begin(tls,String(SUPABASE_URL)+endpoint)) return false;
  http.addHeader("Content-Type","application/json");http.addHeader("apikey",SUPABASE_ANON_KEY);
  int code=http.POST(body);bool ok=code==200 && http.getSize()<=4096;
  if(ok) {response=http.getString();ok=response.length()<=4096;}
  http.end();return ok;
}
bool ch1PostTelemetry(JsonArray rows,String& response) {
  JsonDocument doc;doc["p_rows"]=rows;
  otaLastExchange=millis();
  return ch1Rpc("/rest/v1/rpc/ingest_ch1",doc,response);
}
bool ch1ProcessResponse(const String& response,bool updating) {
  JsonDocument result;
  if(deserializeJson(result,response) || !result["c"].is<JsonArray>() || result["c"].size()!=9 || !result["r"].is<uint32_t>()) return false;
  JsonArray values=result["c"].as<JsonArray>();
  for(int i=0;i<9;i++) if(i<4 ? (!values[i].is<float>() || !isfinite(values[i].as<float>())) : !values[i].is<bool>()) return false;
  uint32_t revision=result["r"].as<uint32_t>();
  if(!updating && (!ch1HaveRevision || revision>ch1CommandRevision)) {
    otaApplyValues(values);ch1CommandRevision=revision;ch1HaveRevision=true;
    ch1RequestedResetSequence=result["q"].is<uint32_t>()?result["q"].as<uint32_t>():ch1ResetSequence;
    updateOutputsLogic(); // Same output implementation; apply immediately after the exchange.
  }
  String ack=result["a"]|"";
  if((ack=="completed" || ack=="failed") && ack!=otaPhase && otaJobId.length()) {otaPhase=ack;otaProgress=ack=="completed"?100:otaProgress;otaSave();}
  OtaJob job;
  if(CH1_OTA_ENABLED && !updating && result["o"].is<JsonObject>() && otaDecode(result["o"].as<JsonObject>(),job)) otaRun(job);
  return true;
}
bool ch1DeviceSync(bool updating) {
  // Bounded reports during an active OTA only. Never used by the ordinary loop.
  if(!updating || otaSyncing || !otaJobId.length()) return false;
  otaSyncing=true;otaLastExchange=millis();
  JsonDocument metadata,doc;deserializeJson(metadata,ch1GatewayMetadata());doc["p_gateway"]=metadata["gateway"];
  String response;bool ok=ch1Rpc("/rest/v1/rpc/ch1_ota_report",doc,response);
  if(ok) ok=ch1ProcessResponse(response,true);
  otaSyncing=false;return ok;
}
static void ch1OtaInit() {
  uint8_t boot[16];esp_fill_random(boot,sizeof(boot));otaBoot=otaHex(boot,sizeof(boot));
  otaReady=otaPrefs.begin("ch1ota",false);
  if(otaReady) ch1ResetSequence=otaPrefs.getUInt("reset_seq",0);
  if(!otaReady) return; // Monitoring continues even if OTA persistence is unavailable.
  JsonDocument record;String saved=otaPrefs.getString("record","");
  if(saved.length() && !deserializeJson(record,saved)) {
    otaJobId=record["job"]|"";otaTarget=record["target"]|"";otaPhase=record["state"]|"idle";otaPrevious=record["previous"]|"";
    if(otaPhase!="idle" && otaPhase!="completed" && otaPhase!="failed") {
      if(otaTarget==ch1VersionMarker+15) {otaPhase="waiting_for_telemetry";otaProgress=99;otaBootCheck=true;otaBootStarted=millis();}
      else otaPhase="failed"; // Interrupted download or automatic rollback; never replay.
      otaSave();
    }
  }
}
static void ch1OtaRecoveryCheck() {
  if(!otaBootCheck || otaTelemetryHealthy || millis()-otaBootStarted<120000) return;
  otaPhase="failed";otaSave();otaBootCheck=false;
  esp_ota_img_states_t state;
  if(esp_ota_get_state_partition(esp_ota_get_running_partition(),&state)==ESP_OK && state==ESP_OTA_IMG_PENDING_VERIFY)
    esp_ota_mark_app_invalid_rollback_and_reboot();
  // Application-level recovery for toolchains whose bundled bootloader lacks rollback.
  // A hang before setup still requires a rollback-enabled bootloader or USB recovery.
  const esp_partition_t* previous=esp_partition_find_first(ESP_PARTITION_TYPE_APP,ESP_PARTITION_SUBTYPE_ANY,otaPrevious.c_str());
  if(previous && previous!=esp_ota_get_running_partition() && esp_ota_set_boot_partition(previous)==ESP_OK) ESP.restart();
}
