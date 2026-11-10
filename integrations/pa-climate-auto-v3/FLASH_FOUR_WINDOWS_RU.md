# Farmplast PA Climate 2.0.0 — first flashing of four ESP32 (Windows workstation)

**Use THIS BRANCH, NOT the older AUTO_v3 ZIP**: `work/pa-climate-auto-msi-20261110`.
The older ZIP contains `RELAY_TESTED_AND_ENABLED=false`; the GitHub branch has `true` as requested.

## Workstation, NOT the MSI home server

Use the PC beside the four new ESP32-WROOM-32E-N4 boards. Connect one board at a time by USB-to-UART with **3.3 V logic** (TX->RX, RX->TX, GND->GND). The board's programming header is labelled `IO0 GND GND RX TX 5V`. Feed 5V to the board only from a source with adequate current; never apply mains power while USB-UART is connected. Check the 5 V supply wiring before power-up.

Both DS18B20s: VDD->3V3, GND->GND, both DQ->GPIO27 with one 4.7-kOhm pull-up from DQ to 3V3.

## Obtain the current source

Run in PowerShell (with Git installed; clone only once):

```powershell
New-Item -ItemType Directory -Force "D:\Farmplast\Climat" | Out-Null
git clone --depth 1 --single-branch --branch work/pa-climate-auto-msi-20261110 https://github.com/simscope/Farmplast.git "D:\Farmplast\Climat\source"
```

For later updates of this checkout:

```powershell
git -C "D:\Farmplast\Climat\source" pull --ff-only
```

Open in Arduino IDE:

`D:\Farmplast\Climat\source\integrations\pa-climate-auto-v3\firmware\FarmplastClimate\FarmplastClimate.ino`

## Arduino IDE

Board Manager: `esp32 by Espressif Systems`, v3.3.8.
Libraries: `OneWire`, `DallasTemperature`, `ArduinoJson` 7.x.

Tools:
- Board: **ESP32 Dev Module**; Flash Size: **4MB**; Flash Mode: **DIO**;
- Flash Frequency: **40 MHz**; Partition Scheme: **Default 4MB with SPIFFS** (must retain OTA slots);
- CPU 240 MHz; PSRAM Disabled; Upload Speed 115200; correct COM port.

Before the first upload, run **Sketch > Verify/Compile**. If compilation fails, fix that compiler error *before* writing any board. Do not assume the source was compiled successfully by the repository. Also, board-specific relay GPIO/polarity are still unverified: `device_config.h` currently uses GPIO16 active HIGH with relay control enabled.

## First board

1. Disconnect any HVAC/mains loads for the workstation test.
2. Attach one ESP32 to USB-UART, select its COM port.
3. Click **Upload**. If the serial bootloader does not engage automatically, hold `IO0`, press/release `EN`, then release `IO0` as the uploader connects.
4. Arduino IDE must show `Hard resetting via RTS pin...` or equivalent successful write message, not an error.
5. Open Serial Monitor at 115200. Press EN if required. Expect:
   - `Farmplast PA Climate vpa-climate-msi-2.0.0`;
   - `DS18B20 discovery: 2 device(s)`;
   - `T1=...F  T2=...F  AVG=...F` every 5 seconds;
   - `relay=ON/OFF` and `Status: WiFi=OFF, cloud=NOT_CONFIGURED` until provisioned.
6. Test temperatures (T1, T2, average), then confirm local relay behavior. With the default target 72 F and 2 F hysteresis, heating should turn ON at average <= 71 F and OFF at average >= 73 F, subject to the 60-second minimum switching interval. If only one DS18B20 responds, fallback uses that one; both missing => heating OFF.
7. Record its MAC-based device ID printed in Serial Monitor. This distinguishes the four boards without editing code or choosing zone numbers now.

## Boards 2, 3 and 4

Disconnect the board that passed, connect the next board, select its COM port, and repeat **Upload + Serial Monitor check** with the SAME sketch. You do not need to recompile for each board. Keep a note of the four device IDs.

## Server / OTA later

On the workstation, initial flash requires **no MSI connection**. The board can measure and locally regulate temperature with default 72 F setpoint while unprovisioned; it will not appear ONLINE at Farmplast until real MSI HTTPS access, per-device provisioning and an accepted telemetry exchange exist.

Do not enter invented URL, TLS CA, device tokens or Wi-Fi passwords into the sketch. They are intended for separate provisioning via the workstation when MSI integration is available. OTA and rollback are **not** physically validated yet.

**Verification state:** C++ temperature logic and Node server protocol unit tests passed. Full ESP32 board compilation and upload/relay electrical checks have not been confirmed from this workspace; the first physical board is the acceptance test.
