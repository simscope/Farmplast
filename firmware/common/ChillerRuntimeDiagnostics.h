#pragma once

// Override locally in ignored ota_config.h. Never enable in production by default.
#ifndef CHILLER_RUNTIME_DIAGNOSTICS
#define CHILLER_RUNTIME_DIAGNOSTICS 0
#endif
#if CHILLER_RUNTIME_DIAGNOSTICS != 0 && CHILLER_RUNTIME_DIAGNOSTICS != 1
#error "CHILLER_RUNTIME_DIAGNOSTICS must be 0 or 1"
#endif

#if CHILLER_RUNTIME_DIAGNOSTICS
#include <atomic>
#include <esp_heap_caps.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

struct ChillerRuntimeCounters {
  std::atomic<uint32_t> realtime_connection_attempts{0}, realtime_connections{0}, realtime_reconnect_count{0};
  std::atomic<uint32_t> realtime_wake_received{0}, realtime_wake_accepted{0}, realtime_wake_debounced{0}, realtime_wake_ignored{0};
  std::atomic<uint32_t> ota_sync_count{0}, telemetry_post_ok{0}, telemetry_post_fail{0}, telemetry_post_skipped{0};
  std::atomic<uint32_t> plc_poll_ok{0}, plc_poll_fail{0}, realtime_worker_stack_hwm{0};
  std::atomic<bool> realtime_connected{false};
};
static ChillerRuntimeCounters runtimeDiag;
static void chillerRuntimeHealth();
static void runtimeDiagWakeResult(bool accepted) {
  if(accepted) runtimeDiag.realtime_wake_accepted.fetch_add(1,std::memory_order_relaxed);
  else runtimeDiag.realtime_wake_debounced.fetch_add(1,std::memory_order_relaxed);
}
static void runtimeDiagConnection(bool connected) {
  const bool previous=runtimeDiag.realtime_connected.exchange(connected,std::memory_order_relaxed);
  if(connected && !previous) {
    if(runtimeDiag.realtime_connections.fetch_add(1,std::memory_order_relaxed)>0)
      runtimeDiag.realtime_reconnect_count.fetch_add(1,std::memory_order_relaxed);
  }
}
static void runtimeDiagWorkerSample() {
  // Called only by the Realtime worker, never samples the PLC loop's stack.
  static uint32_t lastSample=0;
  if(uint32_t(millis()-lastSample)<1000) return;
  lastSample=millis();
#if INCLUDE_uxTaskGetStackHighWaterMark
  runtimeDiag.realtime_worker_stack_hwm.store(uxTaskGetStackHighWaterMark(nullptr),std::memory_order_relaxed);
#endif
}
static void runtimeDiagHealth(uint32_t fallbackRemaining,bool pending,bool paused) {
  static uint32_t lastLine=0;
  const uint32_t now=millis();
  if(uint32_t(now-lastLine)<60000) return;
  lastLine=now;
#define RD_VALUE(name) (unsigned)runtimeDiag.name.load(std::memory_order_relaxed)
  // Scalars only: never serialize network payloads, URLs, credentials or job data.
  Serial.printf("[RUNTIME] uptime_ms=%u free_heap=%u min_free_heap=%u largest_free_block=%u realtime_worker_stack_hwm=%u realtime_connected=%u realtime_connection_attempts=%u realtime_connections=%u realtime_reconnect_count=%u realtime_wake_received=%u realtime_wake_accepted=%u realtime_wake_debounced=%u realtime_wake_ignored=%u ota_sync_count=%u telemetry_post_ok=%u telemetry_post_fail=%u telemetry_post_skipped=%u plc_poll_ok=%u plc_poll_fail=%u wifi_rssi=%d ota_fallback_remaining_ms=%u ota_sync_pending=%u realtime_paused=%u\n",
    (unsigned)now,(unsigned)heap_caps_get_free_size(MALLOC_CAP_8BIT),
    (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_8BIT),(unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT),
    RD_VALUE(realtime_worker_stack_hwm),RD_VALUE(realtime_connected),RD_VALUE(realtime_connection_attempts),
    RD_VALUE(realtime_connections),RD_VALUE(realtime_reconnect_count),RD_VALUE(realtime_wake_received),
    RD_VALUE(realtime_wake_accepted),RD_VALUE(realtime_wake_debounced),RD_VALUE(realtime_wake_ignored),
    RD_VALUE(ota_sync_count),RD_VALUE(telemetry_post_ok),RD_VALUE(telemetry_post_fail),RD_VALUE(telemetry_post_skipped),
    RD_VALUE(plc_poll_ok),RD_VALUE(plc_poll_fail),WiFi.status()==WL_CONNECTED?WiFi.RSSI():-127,
    (unsigned)fallbackRemaining,(unsigned)pending,(unsigned)paused);
#undef RD_VALUE
}
#define CHILLER_DIAG_COUNT(name) runtimeDiag.name.fetch_add(1,std::memory_order_relaxed)
#define CHILLER_DIAG_CONNECTION(value) runtimeDiagConnection(value)
#define CHILLER_DIAG_WORKER_SAMPLE() runtimeDiagWorkerSample()
#define CHILLER_DIAG_CHECKPOINT(name) otaCheckpoint(name)
#define CHILLER_DIAG_BEGIN() Serial.println("[RUNTIME] CH23_RUNTIME_DIAGNOSTICS=1 interval_ms=60000 fallback_interval_ms=3600000")
#define CHILLER_DIAG_WAKE_RESULT(result) runtimeDiagWakeResult(result)
#define CHILLER_DIAG_HEALTH() chillerRuntimeHealth()
#else
#define CHILLER_DIAG_COUNT(name) ((void)0)
#define CHILLER_DIAG_CONNECTION(value) ((void)0)
#define CHILLER_DIAG_WORKER_SAMPLE() ((void)0)
#define CHILLER_DIAG_CHECKPOINT(name) ((void)0)
#define CHILLER_DIAG_BEGIN() ((void)0)
#define CHILLER_DIAG_WAKE_RESULT(result) ((void)(result))
#define CHILLER_DIAG_HEALTH() ((void)0)
#endif
