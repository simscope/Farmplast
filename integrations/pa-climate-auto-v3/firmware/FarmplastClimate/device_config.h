#pragma once
// UNIVERSAL safe firmware. Identical source/application binary for all PA zones.
// Device-specific Wi-Fi, server URL, device token, OTA HMAC key and trusted root
// certificate are stored in ESP32 NVS via first-time USB serial provisioning.
// None of these credentials is present in the firmware image distributed for OTA.
#define FIRMWARE_VERSION "pa-climate-msi-2.1.0"
#define FIRMWARE_MODEL "PA-ESP32-WROOM32E-N4-R1"
#define DS18B20_GPIO 27
#define RELAY_GPIO 16            // NOT CONFIRMED on the physical relay PCB.
#define RELAY_ACTIVE_HIGH true  // NOT CONFIRMED on the physical relay PCB.
#define RELAY_TESTED_AND_ENABLED true   // Enabled by owner; existing GPIO and polarity preserved.