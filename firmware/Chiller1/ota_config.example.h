#pragma once
// Copy to ignored ota_config.h. Provision only after local hardware tests.
#define CH1_OTA_ENABLED 0
#define CH1_OTA_VERSION "ch1-ota-1"
// Unique random device credential: minimum 32 characters; same value in Edge Function secret.
#define CH1_OTA_DEVICE_KEY ""
// PEM CA trust anchor(s) for the Supabase HTTPS origin. Never use setInsecure for OTA.
#define CH1_OTA_CA_PEM ""
