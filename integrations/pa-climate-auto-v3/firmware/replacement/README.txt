The existing MSI stores FarmplastClimate.ino.bin here for the authorized replacement ZIP.
Current binary identity and SHA256 are in manifest.json. No device credentials are compiled in.
Build firmware/FarmplastClimate with the existing Arduino CLI and the default dual OTA layout:
esp32:esp32:esp32:FlashMode=dio,FlashFreq=40,PartitionScheme=default
Copy the resulting application .ino.bin to this directory before installing the module.
The GitHub Actions PA Climate build also publishes a verified 2.1.0 firmware artifact.
Do not confuse compilation or application readback with a physically confirmed relay or OTA recovery.
