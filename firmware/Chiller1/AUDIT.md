# CH1 audit findings

Source: D:/Farmplast/chiller1/Chiller-1/Chiller-1.ino, SHA-256 736d61d8f4549d2f6d79ab22f8d0224310578afb505a694fe6525116dbe2f0df. The owner identified this as the latest flashed sketch. No flash readback was performed.

## PGRST102 root cause

The previous metadata helper started a String with the JSON fragment prefix `"gateway":` and then called serializeJson(doc, string). Installed ArduinoJson's ArduinoStringWriter clears its destination String when serialization starts. The assumed prefix was therefore lost, and embedding that fragment could make the complete telemetry body invalid. The earlier manual payload construction did not validate the complete body before POST.

The supplied local JSON fix is retained and completed: the helper returns a complete {gateway:{...}} object; mergeGatewayMetadata parses it and copies only the gateway object. All telemetry rows are built with ArduinoJson, finite-number checks, overflow checks and a final deserialize/array validation. Malformed optional metadata is omitted with a diagnostic; it cannot corrupt the batch. Serial logs show payload length, local validation result, HTTP status and response. A live corrected POST requires the owner's USB installation.

## Old website command race

The old HMI issued multiple independent UPDATEs against telemetry_latest, the same rows the ESP overwrote every five seconds with actual state. A command could disappear before the device read it; multi-field speed commands could be observed partially. The UI refreshed those requested values as if they were actual telemetry. RESET wrote true again without a reliable new rising edge. Its PIN check was in browser code.

The replacement writes desired state atomically through the authenticated server endpoint. Device reports remain separate. Revision plus matching actual values proves application; reset has a durable per-command sequence and reported actuation acknowledgement. Server authorization/code and audit logging replace client-only PIN security.

## Egress and telemetry schema

The original CH1 read fetched 19 rows although only setpoint/D1/D2/hysteresis/AUTO/enable/30/60/reset were consumed. Historical measured bodies were 1,361 bytes for 19 rows and 633 bytes for the nine-row filtered compatibility read. The configured firmware instead reads a compact positional response from the single existing five-second device exchange; sensor readings are not returned to it. OTA uses that same exchange, with bounded phase reports during an update.

Telemetry was already batched: one JSON array per five-second cycle, nominal 720 POST/hour, plus startup. The approximately 2,003 POST/hour observation was aggregate traffic and cannot all be assigned to CH1. Retain return=minimal. Body-size projections are not measured billed egress; production billing includes other traffic.

A read-only production schema check on 2026-09-11 verified telemetry_latest_pkey = PRIMARY KEY(point_id), matching the retained on_conflict=point_id. No unrelated telemetry permissions or objects are changed. The CH1 migration is transactional and re-runnable against its own schema, adds service-only tables/functions and a private firmware bucket boundary.

Scope is CH1. CH2, CH3, barrels, overview polling, payroll and ZKT code are unchanged. Current validation and deployment evidence are recorded in OTA-IMPLEMENTATION.md and the release report.
