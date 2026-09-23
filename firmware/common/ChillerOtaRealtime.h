#pragma once
#include <atomic>
#include <WebSocketsClient.h>
#include "OtaWakeSchedule.h"

// WebSockets 2.7.2, Arduino ESP32 3.3.8. No Supabase client library.
// Only this worker owns the socket. Never run TLS connect/loop on the PLC task.
static std::atomic<bool> otaWakeRequested{false}, otaRealtimePause{false}, otaRealtimePaused{true};
static OtaWakeSchedule otaSchedule;
static void requestImmediateOtaSync() { otaWakeRequested.store(true); }
class OtaWakeSocket : public WebSocketsClient {
public:
  bool transportOpen() {return _client.tcp && _client.tcp->connected();}
};
static void otaRealtimeWorker(void*) {
  OtaWakeSocket socket;
  const String topic=String("realtime:chiller-ota-wake:")+DEVICE_CODE;
  const String path=String("/realtime/v1/websocket?apikey=")+SUPABASE_ANON_KEY+"&vsn=1.0.0";
  bool started=false, joined=false, heartbeatPending=false;
  uint32_t retryAt=0, backoff=1000, lastHeartbeat=0, joinStarted=0;
  socket.setReconnectInterval(0); // Outer worker owns bounded exponential retry.
  socket.onEvent([&](WStype_t type,uint8_t* payload,size_t length) {
    if(type==WStype_CONNECTED) {
      joined=false;heartbeatPending=false;joinStarted=millis();
      JsonDocument doc;doc["topic"]=topic;doc["event"]="phx_join";doc["ref"]="join";doc["join_ref"]="join";
      doc["payload"]["config"]["broadcast"]["ack"]=false;
      doc["payload"]["config"]["broadcast"]["self"]=false;
      doc["payload"]["config"]["presence"]["enabled"]=false;
      doc["payload"]["config"]["private"]=false;
      String message;serializeJson(doc,message);socket.sendTXT(message);
    } else if(type==WStype_DISCONNECTED) {
      joined=false;heartbeatPending=false;
    } else if(type==WStype_TEXT && length<=2048) {
      JsonDocument doc;
      if(deserializeJson(doc,payload,length,DeserializationOption::NestingLimit(8))) return;
      const String event=doc["event"]|"";
      if(event=="phx_reply" && doc["topic"]==topic && doc["ref"]=="join") {
        joined=doc["payload"]["status"]=="ok";
        if(joined) {backoff=1000;lastHeartbeat=millis();otaCheckpoint("realtime_connected");}
        else socket.disconnect();
      } else if(event=="phx_reply" && doc["topic"]=="phoenix" && doc["ref"]=="heartbeat" && doc["payload"]["status"]=="ok") {
        heartbeatPending=false;
      } else if(event=="phx_error" || event=="phx_close") socket.disconnect();
      else if(joined && event=="broadcast" && doc["topic"]==topic && doc["payload"]["event"]=="wake" && doc["payload"]["payload"]["device"]==DEVICE_CODE) {
        requestImmediateOtaSync(); // Never decode or install a manifest here.
      }
    }
  });
  for(;;) {
    const uint32_t now=millis();
    if(otaRealtimePause.load() || WiFi.status()!=WL_CONNECTED || time(nullptr)<1700000000) {
      if(started) {socket.disconnect();started=false;}
      otaRealtimePaused.store(true);
    } else if(int32_t(now-retryAt)>=0) {
      otaRealtimePaused.store(false);
      // Close the race with the loop accepting an earlier paused=true ACK.
      // Sequentially consistent atomics ensure either it waits or we see pause.
      if(otaRealtimePause.load()) {
        if(started) {socket.disconnect();started=false;}
        otaRealtimePaused.store(true);
        vTaskDelay(pdMS_TO_TICKS(20));continue;
      }
      if(!started) {
        // Leave room for concurrent HTTPS telemetry. Low memory disables wake only.
        if(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)<60000) {
          otaRealtimePaused.store(true);retryAt=now+30000;
          vTaskDelay(pdMS_TO_TICKS(20));continue;
        }
        socket.beginSslWithCA(SUPABASE_HOST,443,path.c_str(),CHILLER_OTA_CA_PEM,"");
        started=true;
      }
      socket.loop(); // TLS and socket timeouts block this worker only.
      if(socket.isConnected()) {
        if((!joined && uint32_t(millis()-joinStarted)>10000) || (heartbeatPending && uint32_t(millis()-lastHeartbeat)>10000)) socket.disconnect();
        else if(joined && !heartbeatPending && uint32_t(millis()-lastHeartbeat)>=25000) {
          socket.sendTXT("{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"heartbeat\"}");
          lastHeartbeat=now;heartbeatPending=true;
        }
      }
      if(!socket.transportOpen()) {
        socket.disconnect();started=false;otaRealtimePaused.store(true);
        retryAt=millis()+backoff+(esp_random()%1000);
        backoff=std::min(uint32_t(60000),backoff*2);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
static void chillerOtaRealtimeInit() {
  // One boot report retains initialization and durable failure/recovery reporting.
  // Reconnects never request an extra sync; the idle schedule remains hourly.
  otaSchedule.pending=true;
  // Failure to allocate a worker leaves hourly fallback available.
  if(xTaskCreate(otaRealtimeWorker,"ota-wake",8192,nullptr,1,nullptr)!=pdPASS)
    Serial.println("[OTA] realtime_worker_unavailable");
}
static bool chillerOtaSyncDue() {
  const uint32_t now=millis();
  if(otaWakeRequested.exchange(false)) otaSchedule.wake(DEVICE_CODE,DEVICE_CODE,now);
  const bool active=otaPhase!="idle" && otaPhase!="completed" && otaPhase!="failed";
  if(!otaSchedule.due(now,active)) {otaRealtimePause.store(false);return false;}
  // Asynchronous shutdown releases Realtime TLS before sync/download TLS is allocated.
  otaRealtimePause.store(true);
  if(!otaRealtimePaused.load() || WiFi.status()!=WL_CONNECTED || !otaReady || time(nullptr)<1700000000) return false;
  otaSchedule.attempted(now);return true;
}
