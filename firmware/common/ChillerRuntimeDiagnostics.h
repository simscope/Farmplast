#pragma once
#ifndef CHILLER_RUNTIME_DIAGNOSTICS
#define CHILLER_RUNTIME_DIAGNOSTICS 0
#endif
#if CHILLER_RUNTIME_DIAGNOSTICS != 0 && CHILLER_RUNTIME_DIAGNOSTICS != 1
#error "CHILLER_RUNTIME_DIAGNOSTICS must be 0 or 1"
#endif
#if CHILLER_RUNTIME_DIAGNOSTICS
#include <esp_heap_caps.h>
struct ChillerRuntimeCounters {
 uint32_t telemetry_post_ok=0,telemetry_post_fail=0,telemetry_post_skipped=0,plc_poll_ok=0,plc_poll_fail=0;
};
static ChillerRuntimeCounters runtimeDiag;
static void chillerRuntimeHealth() {
 static uint32_t lastLine=0;
 const uint32_t now=millis();if(uint32_t(now-lastLine)<60000) return;lastLine=now;
 Serial.printf("[RUNTIME] uptime_ms=%u free_heap=%u min_free_heap=%u largest_free_block=%u telemetry_post_ok=%u telemetry_post_fail=%u plc_poll_ok=%u plc_poll_fail=%u wifi_rssi=%d\n",
 (unsigned)now,(unsigned)heap_caps_get_free_size(MALLOC_CAP_8BIT),(unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_8BIT),(unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT),
 (unsigned)runtimeDiag.telemetry_post_ok,(unsigned)runtimeDiag.telemetry_post_fail,(unsigned)runtimeDiag.plc_poll_ok,(unsigned)runtimeDiag.plc_poll_fail,WiFi.status()==WL_CONNECTED?WiFi.RSSI():-127);
}
#define CHILLER_DIAG_COUNT(name) (++runtimeDiag.name)
#define CHILLER_DIAG_CHECKPOINT(name) otaCheckpoint(name)
#define CHILLER_DIAG_BEGIN() Serial.println("[RUNTIME] CH23_RUNTIME_DIAGNOSTICS=1 interval_ms=60000")
#define CHILLER_DIAG_HEALTH() chillerRuntimeHealth()
#else
#define CHILLER_DIAG_COUNT(name) ((void)0)
#define CHILLER_DIAG_CHECKPOINT(name) ((void)0)
#define CHILLER_DIAG_BEGIN() ((void)0)
#define CHILLER_DIAG_HEALTH() ((void)0)
#endif
