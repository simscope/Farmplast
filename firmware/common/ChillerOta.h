#pragma once
#include <Preferences.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <esp_heap_caps.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <utility>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>

// OTA itself has no relay, operating-mode or service-state hooks.
#if !CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE
#error "CH2/CH3 OTA requires the rollback-enabled ESP32 core/bootloader configuration"
#endif
static const char chillerVersionMarker[] = "CH23OTA_VERSION=" CHILLER_OTA_VERSION;
static const char chillerDeviceMarker[] = CHILLER_OTA_DEVICE_MARKER;
static Preferences otaPrefs;
static bool otaReady=false, otaSyncing=false, otaBootCheck=false, otaTelemetryHealthy=false;
static String otaJobId, otaTarget, otaPhase="idle", otaPrevious, otaBoot;
// Empty or a backend-approved literal only; never preserve server text or URLs.
static String otaFailureCode;
static const char* const otaFailureCodes[]={
 "stage_sync_failed","state_save_failed","slot_invalid","job_expired","download_begin_failed",
 "download_http_status","download_size_mismatch","ota_begin_failed","download_timeout","ota_write_failed",
 "sha256_mismatch","version_marker_missing","device_marker_missing","ota_end_failed","boot_partition_failed",
 "interrupted_update","telemetry_timeout"
};
static bool otaAllowedFailure(const String& code) {
  for(const char* allowed:otaFailureCodes) if(code==allowed) return true;
  return false;
}
static bool otaFail(const char* code) {
  // Preserve the first local cause if reporting or a later cleanup also fails.
  if(!otaFailureCode.length() && otaAllowedFailure(code)) otaFailureCode=code;
  return false;
}
static const char* otaResetReason() {
  switch(esp_reset_reason()) {
    case ESP_RST_POWERON:return "power_on";
    case ESP_RST_SW:return "software";
    case ESP_RST_PANIC:return "panic";
    case ESP_RST_INT_WDT:return "interrupt_watchdog";
    case ESP_RST_TASK_WDT:return "task_watchdog";
    case ESP_RST_BROWNOUT:return "brownout";
    default:return "other";
  }
}
static bool otaSafeJobId(const String& value) {
  if(value.length()!=36) return false;
  for(unsigned i=0;i<36;i++) {
    if(i==8 || i==13 || i==18 || i==23) {if(value[i]!='-') return false;}
    else if(!((value[i]>='0' && value[i]<='9') || (value[i]>='a' && value[i]<='f'))) return false;
  }
  return true;
}
static const char* otaSafePhase(const String& phase) {
  for(const char* allowed:{"idle","authorized","downloading","verifying","installing","rebooting","waiting_for_telemetry","completed","failed"})
    if(phase==allowed) return allowed;
  return "invalid";
}
static int otaProgress=0;
static unsigned long otaBootStarted=0, otaLastExchange=0;
struct OtaJob { String id,version,sha,url; uint32_t size; int64_t expires; };
static OtaJob otaPendingJob{};
static bool otaPending=false;

// Rare transition diagnostics only. No payload, URL, credential or HMAC logging.
static void otaCheckpoint(const char* checkpoint) {
  Serial.printf("[OTA] %s\n",checkpoint);
  Serial.printf("[OTA] resources free_heap=%u min_free_heap=%u largest_block=%u",
    (unsigned)heap_caps_get_free_size(MALLOC_CAP_8BIT),
    (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_8BIT),
    (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
#if INCLUDE_uxTaskGetStackHighWaterMark
  // ESP-IDF reports bytes (not upstream FreeRTOS words); nullptr = current task.
  Serial.printf(" stack_hwm_bytes=%u",(unsigned)uxTaskGetStackHighWaterMark(nullptr));
#endif
  Serial.println();
}

static String otaHex(const uint8_t* bytes,size_t count) {
  const char* digits="0123456789abcdef"; String value;value.reserve(count*2);
  for(size_t i=0;i<count;i++) {value+=digits[bytes[i]>>4];value+=digits[bytes[i]&15];}
  return value;
}
static bool otaSave() {
  if(!otaReady) return false;
  JsonDocument doc;doc["job"]=otaJobId;doc["target"]=otaTarget;doc["state"]=otaPhase;doc["previous"]=otaPrevious;doc["failure"]=otaFailureCode;
  String record;serializeJson(doc,record);
  // One atomic NVS value prevents partial job/phase writes from replaying an update.
  return otaPrefs.putString("record",record)==record.length();
}
String chillerGatewayMetadata() {
  JsonDocument doc;doc["device"]=chillerDeviceMarker+15;doc["version"]=chillerVersionMarker+16;doc["boot"]=otaBoot;doc["job"]=otaJobId;
  String result;serializeJson(doc,result);return result;
}
void chillerTelemetryPublished() {
  if(otaBootCheck) {
    if(otaTarget!=chillerVersionMarker+16) return;
    esp_ota_img_states_t state;
    if(esp_ota_get_state_partition(esp_ota_get_running_partition(),&state)==ESP_OK && state==ESP_OTA_IMG_PENDING_VERIFY)
      if(esp_ota_mark_app_valid_cancel_rollback()!=ESP_OK) return;
    otaBootCheck=false;
  }
  otaTelemetryHealthy=true;
}
static bool otaDecode(JsonObject doc,OtaJob& job) {
  String action=doc["action"]|"",model=doc["model"]|"",mac=doc["mac"]|"";
  job.id=doc["id"]|"";job.version=doc["version"]|"";job.sha=doc["sha256"]|"";job.url=doc["url"]|"";
  job.expires=doc["expires"]|int64_t(0);job.size=doc["size"]|uint32_t(0);
  if(job.id.length()!=36 || model!=CHILLER_OTA_MODEL || String(doc["device"]|"")!=DEVICE_CODE || action!="update" || job.expires<=time(nullptr) || job.expires>time(nullptr)+660 || job.version.length()>48 || job.url.length()>2048) return false;
  if(job.sha.length()!=64 || !job.size || job.size>1310720 || !job.version.length() || job.version==chillerVersionMarker+16 || !job.url.startsWith(String("https://")+SUPABASE_HOST+"/storage/v1/object/sign/chiller-firmware/"+DEVICE_CODE+"/")) return false;
  String canonical=job.id+"|update|"+String(DEVICE_CODE)+"|"+model+"|"+job.version+"|"+job.sha+"|"+String(job.size)+"|"+String((long long)job.expires);
  uint8_t digest[32];
  if(mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),(const uint8_t*)CHILLER_OTA_DEVICE_KEY,strlen(CHILLER_OTA_DEVICE_KEY),(const uint8_t*)canonical.c_str(),canonical.length(),digest)) return false;
  String expected=otaHex(digest,32);unsigned diff=mac.length()^expected.length();
  for(unsigned i=0;i<expected.length();i++) diff|=expected[i]^(i<mac.length()?mac[i]:0);
  return diff==0;
}
static bool otaStage(const char* phase,int progress) {
  otaPhase=phase;otaProgress=progress;
  if(otaPhase=="authorized") otaCheckpoint("authorized_save_begin");
  if(!otaSave()) return otaFail("state_save_failed");
  if(otaPhase=="authorized") {
    otaCheckpoint("authorized_save_ok");
    otaCheckpoint("authorized_sync_begin");
  }
  if(!chillerDeviceSync(true)) {
    otaFail("stage_sync_failed");otaSave(); // Best effort persistence only; the stage still aborts.
    return false;
  }
  if(otaPhase=="authorized") otaCheckpoint("authorized_sync_ok");
  // A successful sync with a terminal server ACK is not a transport failure.
  return otaPhase!="failed";
}
static bool otaInstall(const OtaJob& job) {
  const esp_partition_t* slot=esp_ota_get_next_update_partition(nullptr);
  if(!slot || slot==esp_ota_get_running_partition() || job.size>slot->size) return otaFail("slot_invalid");
  if(job.expires<=time(nullptr)) return otaFail("job_expired");
  if(!otaStage("downloading",0)) return false;
  forceInternetToWiFi();
  WiFiClientSecure tls;tls.setCACert(CHILLER_OTA_CA_PEM);
  HTTPClient http;http.setTimeout(10000);http.setConnectTimeout(5000);
  if(!http.begin(tls,job.url)) return otaFail("download_begin_failed");
  if(http.GET()!=200) {http.end();return otaFail("download_http_status");}
  if(http.getSize()!=int(job.size)) {http.end();return otaFail("download_size_mismatch");}
  esp_ota_handle_t handle;
  if(esp_ota_begin(slot,job.size,&handle)!=ESP_OK) {http.end();return otaFail("ota_begin_failed");}
  mbedtls_sha256_context sha;mbedtls_sha256_init(&sha);mbedtls_sha256_starts(&sha,0);
  auto stream=http.getStreamPtr();uint8_t buffer[1024];uint32_t remaining=job.size,lastData=millis();bool ok=true;
  uint8_t scan[1152];size_t carry=0;bool versionFound=false,deviceFound=false;
  String versionNeedle=String("CH23OTA_VERSION=")+job.version;
  String deviceNeedle=String("CH23OTA_DEVICE=")+DEVICE_CODE;
  while(remaining) {
    if(time(nullptr)>=job.expires) {ok=otaFail("job_expired");break;}
    if(millis()-lastData>15000) {ok=otaFail("download_timeout");break;}
    if(otaPhase=="failed") {ok=false;break;}
    size_t available=stream->available();
    if(available) {
      size_t count=stream->readBytes(buffer,std::min(size_t(remaining),std::min(available,sizeof(buffer))));
      if(!count) {ok=otaFail("download_timeout");break;}
      if(esp_ota_write(handle,buffer,count)!=ESP_OK) {ok=otaFail("ota_write_failed");break;}
      memcpy(scan+carry,buffer,count);size_t scanSize=carry+count;
      for(size_t i=0;i<scanSize;i++) {
        if(i+versionNeedle.length()+1<=scanSize && !memcmp(scan+i,versionNeedle.c_str(),versionNeedle.length()+1)) versionFound=true;
        if(i+deviceNeedle.length()+1<=scanSize && !memcmp(scan+i,deviceNeedle.c_str(),deviceNeedle.length()+1)) deviceFound=true;
      }
      carry=std::min(size_t(128),scanSize);memmove(scan,scan+scanSize-carry,carry);
      mbedtls_sha256_update(&sha,buffer,count);remaining-=count;lastData=millis();
      otaProgress=int((uint64_t(job.size-remaining)*90)/job.size);
    }
    // The ordinary loop is suspended during the transfer. This uses its SAME device
    // exchange, at the same interval, rather than starting another polling task/timer.
    if(millis()-otaLastExchange>=OTA_ACTIVE_CHECK_INTERVAL_MS) chillerDeviceSync(true);
    delay(1);
  }
  uint8_t digest[32];mbedtls_sha256_finish(&sha,digest);mbedtls_sha256_free(&sha);http.end();
  if(!ok || !otaStage("verifying",90)) {esp_ota_abort(handle);return false;}
  if(otaHex(digest,32)!=job.sha) {esp_ota_abort(handle);return otaFail("sha256_mismatch");}
  if(!versionFound) {esp_ota_abort(handle);return otaFail("version_marker_missing");}
  if(!deviceFound) {esp_ota_abort(handle);return otaFail("device_marker_missing");}
  if(!otaStage("installing",95)) {esp_ota_abort(handle);return false;}
  // Bytes were staged only in the inactive slot; installation validates/activates it.
  if(esp_ota_end(handle)!=ESP_OK) return otaFail("ota_end_failed");
  if(job.expires<=time(nullptr)) return otaFail("job_expired");
  if(!otaStage("rebooting",99)) return false;
  if(esp_ota_set_boot_partition(slot)!=ESP_OK) return otaFail("boot_partition_failed");
  ESP.restart();return true;
}
static void otaRun(const OtaJob& job) {
  if(job.id==otaJobId || !otaReady) return;
  otaFailureCode=""; // Only a NEW authenticated job may discard the previous failure.
  otaJobId=job.id;otaTarget=job.version;otaPrevious=esp_ota_get_running_partition()->label;
  if(otaStage("authorized",0) && otaInstall(job)) return;
  otaPhase="failed";otaSave();chillerDeviceSync(true);
  // Failure automatically returns to the normal sensor/publish loop on the running image.
}
static void otaQueueDecodedJob(OtaJob& job) {
  if(otaPending || job.id==otaJobId || !otaReady) return;
  // Arduino String move transfers ownership; no JsonDocument references survive.
  otaPendingJob=std::move(job);
  otaPending=true;
  otaCheckpoint("manifest_queued");
}
static void chillerOtaRunPending() {
  if(!otaPending || otaSyncing) return;
  OtaJob job=std::move(otaPendingJob);
  otaPendingJob=OtaJob{};
  otaPending=false; // Consume before any stage sync/failure; never requeue this job.
  otaCheckpoint("deferred_run_begin");
  otaRun(job);
}
bool chillerDeviceSync(bool updating) {
  if(!otaReady || otaSyncing || WiFi.status()!=WL_CONNECTED || time(nullptr)<1700000000 || strlen(CHILLER_OTA_DEVICE_KEY)<32 || strlen(CHILLER_OTA_CA_PEM)<100) return false;
  otaSyncing=true;otaLastExchange=millis();
  WiFiClientSecure tls;tls.setCACert(CHILLER_OTA_CA_PEM);
  HTTPClient http;http.setTimeout(10000);http.setConnectTimeout(5000);
  bool ok=http.begin(tls,String("https://")+SUPABASE_HOST+"/functions/v1/chiller-ota");
  String response;
  if(ok) {
    http.addHeader("Content-Type","application/json");http.addHeader("apikey",SUPABASE_ANON_KEY);http.addHeader("x-chiller-device-key",CHILLER_OTA_DEVICE_KEY);
    JsonDocument doc;doc["op"]="sync";doc["device"]=DEVICE_CODE;doc["version"]=chillerVersionMarker+16;doc["boot"]=otaBoot;doc["job"]=otaJobId;doc["status"]=otaPhase;doc["progress"]=otaProgress;
    if(otaPhase=="failed" && otaFailureCode.length()) doc["failure_code"]=otaFailureCode;
    String body;serializeJson(doc,body);int code=http.POST(body);
    ok=code==200 && http.getSize()<=4096;
    if(ok) {response=http.getString();ok=response.length()<=4096;}
  }
  http.end();JsonDocument result;
  ok=ok && !deserializeJson(result,response) && result["device"]==DEVICE_CODE;
  if(ok) {
    String ack=result["a"]|"";
    if((ack=="completed" || ack=="failed") && ack!=otaPhase && otaJobId.length()) {otaPhase=ack;otaProgress=ack=="completed"?100:otaProgress;otaSave();}
  }
  otaSyncing=false;
  OtaJob job;
  if(ok && !updating && result["o"].is<JsonObject>() && otaDecode(result["o"].as<JsonObject>(),job)) {
    Serial.printf("[OTA] manifest_decoded job=%s\n",otaSafeJobId(job.id)?job.id.c_str():"invalid");
    otaCheckpoint("manifest_decoded");
    otaQueueDecodedJob(job);
  }
  return ok;
}
static void chillerOtaInit() {
  Serial.printf("[OTA] reset_reason=%s code=%d\n",otaResetReason(),int(esp_reset_reason()));
  uint8_t boot[16];esp_fill_random(boot,sizeof(boot));otaBoot=otaHex(boot,sizeof(boot));
  otaReady=otaPrefs.begin("ch23ota",false);
  const auto running=esp_ota_get_running_partition();
  const auto next=esp_ota_get_next_update_partition(nullptr);
  otaReady=otaReady && ESP.getFlashChipSize()>=4194304 && next && running && next!=running && next->size>=1310720;
  if(!otaReady) return; // Monitoring continues; no OTA acceptance without verified slots.
  esp_ota_img_states_t bootState;
  if(esp_ota_get_state_partition(running,&bootState)==ESP_OK && bootState==ESP_OTA_IMG_PENDING_VERIFY) {otaBootCheck=true;otaBootStarted=millis();}
  JsonDocument record;String saved=otaPrefs.getString("record","");
  if(saved.length() && !deserializeJson(record,saved)) {
    otaJobId=record["job"]|"";otaTarget=record["target"]|"";otaPhase=record["state"]|"idle";otaPrevious=record["previous"]|"";
    String restoredFailure=record["failure"]|"";
    otaFailureCode=otaAllowedFailure(restoredFailure)?restoredFailure:String("");
    Serial.printf("[OTA] restored_job=%s\n",otaSafeJobId(otaJobId)?otaJobId.c_str():"none_or_invalid");
    Serial.printf("[OTA] restored_phase=%s\n",otaSafePhase(otaPhase));
    Serial.printf("[OTA] restored_failure=%s\n",otaFailureCode.length()?otaFailureCode.c_str():"none");
    if(otaPhase!="idle" && otaPhase!="completed" && otaPhase!="failed") {
      if(otaTarget==chillerVersionMarker+16) {otaPhase="waiting_for_telemetry";otaProgress=99;otaBootCheck=true;otaBootStarted=millis();}
      else {otaFail("interrupted_update");otaPhase="failed";} // Keep any earlier precise cause; never replay.
      otaSave();
    }
  }
}
static void chillerOtaRecoveryCheck() {
  if(!otaBootCheck || otaTelemetryHealthy || millis()-otaBootStarted<120000) return;
  otaFail("telemetry_timeout");otaPhase="failed";otaSave();otaBootCheck=false;
  esp_ota_img_states_t state;
  if(esp_ota_get_state_partition(esp_ota_get_running_partition(),&state)==ESP_OK && state==ESP_OTA_IMG_PENDING_VERIFY)
    esp_ota_mark_app_invalid_rollback_and_reboot();
  // Fallback if the running slot is no longer pending; the build still requires
  // a rollback-enabled bootloader for hangs before setup.
  const esp_partition_t* previous=esp_partition_find_first(ESP_PARTITION_TYPE_APP,ESP_PARTITION_SUBTYPE_ANY,otaPrevious.c_str());
  if(previous && previous!=esp_ota_get_running_partition() && esp_ota_set_boot_partition(previous)==ESP_OK) ESP.restart();
}
