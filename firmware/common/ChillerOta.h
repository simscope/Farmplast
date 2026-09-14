#pragma once
#include <Preferences.h>
#include <esp_ota_ops.h>
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
  if(!otaSave()) return false;
  return chillerDeviceSync(true) && otaPhase!="failed";
}
static bool otaInstall(const OtaJob& job) {
  const esp_partition_t* slot=esp_ota_get_next_update_partition(nullptr);
  if(!slot || slot==esp_ota_get_running_partition() || job.size>slot->size || job.expires<=time(nullptr)) return false;
  if(!otaStage("downloading",0)) return false;
  forceInternetToWiFi();
  WiFiClientSecure tls;tls.setCACert(CHILLER_OTA_CA_PEM);
  HTTPClient http;http.setTimeout(10000);http.setConnectTimeout(5000);
  if(!http.begin(tls,job.url)) return false;
  if(http.GET()!=200 || http.getSize()!=int(job.size)) {http.end();return false;}
  esp_ota_handle_t handle;
  if(esp_ota_begin(slot,job.size,&handle)!=ESP_OK) {http.end();return false;}
  mbedtls_sha256_context sha;mbedtls_sha256_init(&sha);mbedtls_sha256_starts(&sha,0);
  auto stream=http.getStreamPtr();uint8_t buffer[1024];uint32_t remaining=job.size,lastData=millis();bool ok=true;
  uint8_t scan[1152];size_t carry=0;bool versionFound=false,deviceFound=false;
  String versionNeedle=String("CH23OTA_VERSION=")+job.version;
  String deviceNeedle=String("CH23OTA_DEVICE=")+DEVICE_CODE;
  while(remaining) {
    if(time(nullptr)>=job.expires || millis()-lastData>15000 || otaPhase=="failed") {ok=false;break;}
    size_t available=stream->available();
    if(available) {
      size_t count=stream->readBytes(buffer,std::min(size_t(remaining),std::min(available,sizeof(buffer))));
      if(!count || esp_ota_write(handle,buffer,count)!=ESP_OK) {ok=false;break;}
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
    if(millis()-otaLastExchange>=OTA_CHECK_INTERVAL_MS) chillerDeviceSync(true);
    delay(1);
  }
  uint8_t digest[32];mbedtls_sha256_finish(&sha,digest);mbedtls_sha256_free(&sha);http.end();
  if(!ok || !otaStage("verifying",90) || otaHex(digest,32)!=job.sha || !versionFound || !deviceFound) {esp_ota_abort(handle);return false;}
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
  otaPhase="failed";otaSave();chillerDeviceSync(true);
  // Failure automatically returns to the normal sensor/publish loop on the running image.
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
  if(ok && !updating && result["o"].is<JsonObject>() && otaDecode(result["o"].as<JsonObject>(),job)) otaRun(job);
  return ok;
}
static void chillerOtaInit() {
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
    if(otaPhase!="idle" && otaPhase!="completed" && otaPhase!="failed") {
      if(otaTarget==chillerVersionMarker+16) {otaPhase="waiting_for_telemetry";otaProgress=99;otaBootCheck=true;otaBootStarted=millis();}
      else otaPhase="failed"; // Interrupted download or automatic rollback; never replay.
      otaSave();
    }
  }
}
static void chillerOtaRecoveryCheck() {
  if(!otaBootCheck || otaTelemetryHealthy || millis()-otaBootStarted<120000) return;
  otaPhase="failed";otaSave();otaBootCheck=false;
  esp_ota_img_states_t state;
  if(esp_ota_get_state_partition(esp_ota_get_running_partition(),&state)==ESP_OK && state==ESP_OTA_IMG_PENDING_VERIFY)
    esp_ota_mark_app_invalid_rollback_and_reboot();
  // Fallback if the running slot is no longer pending; the build still requires
  // a rollback-enabled bootloader for hangs before setup.
  const esp_partition_t* previous=esp_partition_find_first(ESP_PARTITION_TYPE_APP,ESP_PARTITION_SUBTYPE_ANY,otaPrevious.c_str());
  if(previous && previous!=esp_ota_get_running_partition() && esp_ota_set_boot_partition(previous)==ESP_OK) ESP.restart();
}
