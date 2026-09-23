#pragma once
#include <stdint.h>
#include <string.h>

static constexpr uint32_t OTA_FALLBACK_CHECK_INTERVAL_MS = 3600000UL;
static constexpr uint32_t OTA_WAKE_MIN_INTERVAL_MS = 30000UL;
static constexpr uint32_t OTA_ACTIVE_CHECK_INTERVAL_MS = 15000UL;

// Owned by the loop task. The WebSocket worker only posts an atomic flag.
struct OtaWakeSchedule {
  uint32_t lastAttempt=0, lastWake=0;
  bool pending=false, seenWake=false;
  bool wake(const char* target,const char* device,uint32_t now) {
    if(strcmp(target,device) || (seenWake && uint32_t(now-lastWake)<OTA_WAKE_MIN_INTERVAL_MS)) return false;
    lastWake=now;seenWake=true;pending=true;return true;
  }
  bool due(uint32_t now,bool active) const {
    return pending || uint32_t(now-lastAttempt)>=(active?OTA_ACTIVE_CHECK_INTERVAL_MS:OTA_FALLBACK_CHECK_INTERVAL_MS);
  }
  void attempted(uint32_t now) {lastAttempt=now;pending=false;}
};
