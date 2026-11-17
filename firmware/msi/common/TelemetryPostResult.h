#pragma once

// A skipped sample says nothing about Internet health.
enum TelemetryPostResult {
  POST_SKIPPED_NO_DATA,
  POST_SKIPPED_TIME_NOT_READY,
  POST_NETWORK_FAILED,
  POST_HTTP_FAILED,
  POST_OK
};
