# CH1 firmware, remote fan commands and OTA

This is the replacement sketch for D:/Farmplast/chiller1/Chiller-1/Chiller-1.ino. Open only Chiller1.ino in this directory; Ch1Ota.h is its companion header, not a second sketch. The original D: file remains unchanged.

The latest owner task explicitly includes the existing fan-enable, 30 Hz, 60 Hz and reset outputs. Their GPIO mapping and automatic/manual logic are preserved. OTA introduces no maintenance interlock or return-to-service action. It temporarily suspends the ESP loop and reboots; normal collection, fan logic and telemetry resume at startup.

Website commands now go through ch1-ota -> ch1_control_request -> ch1_desired_state. The existing five-second ch1DeviceSync exchange delivers desired values, command revision, one-shot reset sequence, and OTA metadata together. The website shows APPLIED only after matching device-reported telemetry. It never writes desired values into telemetry_latest.

Telemetry is one ArduinoJson array upsert every five seconds, with Prefer: resolution=merge-duplicates,return=minimal. Nineteen point mappings are retained; invalid numeric sensor readings are omitted. Optional gateway metadata is parsed and merged as an object, never concatenated into JSON.

OTA lifecycle: idle -> authorized -> downloading -> verifying -> installing -> rebooting -> waiting_for_telemetry -> completed. A verified operator and server-side code are required. Firmware uses verified HTTPS, an authenticated manifest, SHA-256, inactive-slot installation, persistent job state, and rollback/recovery. Completion requires the target firmware, a new boot ID and successful telemetry.

Build: Arduino ESP32 core 3.3.8; ESP32S3 Dev Module; USB CDC On Boot Enabled; default 4 MB dual OTA partition layout. FQBN: esp32:esp32:esp32s3:CDCOnBoot=cdc. Libraries: ArduinoJson, OneWire, DallasTemperature. The installed core's sdkconfig has CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y; the header rejects an OTA build without it. Physical recovery still requires hardware verification.

secrets.h and ota_config.h are local ignored files. Examples contain placeholders only. Never publish these files or binary images publicly: firmware contains the device credential. Use the private ch1-firmware bucket for approved OTA application images.

See OTA-IMPLEMENTATION.md for the protocol, tests and acceptance procedure. Supabase/frontend publication is authorized; flashing the device remains the owner's USB step.
