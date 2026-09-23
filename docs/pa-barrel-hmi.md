# PA barrel/mixer web HMI reference

## Source authority inspected before implementation

The Arduino JC8012P4A1_HMI project is the reference, rather than the older hmi-jc8012p4a1 demo with placeholder mixers. Its README records the D2 upload and identifies the 1280×800 panel. No physical screen capture was found in firmware/reports; the available PNGs are connector schematics. Comparison is therefore against source geometry, not a claim of pixel verification against the physical display.

Exact workspace references (relative to C:/Users/Owner/Documents/farmplast):
- firmware/JC8012P4A1_HMI/ui.cpp:61–73: stateColor/stateText, gray offline, yellow ≤20%, green ≤80%, red >80%.
- ui.cpp:301 createRecipeRow: MATERIAL LOADS, COLOR LOADS, minus/value/plus positions.
- ui.cpp:326 createSilosScreen: Material Silo Monitoring, MIXERS navigation, four 280×650 panels at x=25+i×310/y=105; capsule shell 150×390, fill width126/max height330, gray base170×42, centered percentage, RAW and status labels.
- ui.cpp:402 createMixersScreen: separate Mixers screen, HOME / SILOS; three360×570 panels at x=75+i×410/y=120; START/STOP130×72; vacuum hopper label, recipe rows, ratio, STATUS, CYCLE/ALARM.
- ui.cpp:608 uiUpdate: fill-height calculation and PLC link label.
- firmware/JC8012P4A1_HMI/ui.h: SiloDisplayState and MixerRecipe fields.
- firmware/JC8012P4A1_HMI/hmi_config.h and README.md: panel hardware, local recipe defaults and operating context.

Modes/assignments are not drawn on the source mixer screen. Source STATUS: READY and START/STOP REQUESTED are local display/command states, not measured run feedback. Recipe editing and command callbacks have not been ported.

## Reproduced

Two screen composition and navigation, four silos / three mixers, source palette, shapes and proportions, percentage placement, RAW/status, mixer grouping, recipe labels and control geometry. Level bands are translated into panelDisplay.js for display only; explicit adapter alarms remain the authority for alarms. All data enters through the existing normalized PA adapter.

## Intentional browser differences

- Fluid sizing preserves desktop proportions and fits the panel within available screen height. Below700px silos wrap2×2 and mixers stack for readability.
- Arial substitutes for embedded LVGL Montserrat; font metrics, LVGL default theme/padding and rasterization are not pixel-identical. Header PLC status is placed below the title to prevent source title/status overlap.
- Browser adds Back to PA Overview and a monitoring-only notice. Only screen navigation works. START/STOP and all recipe buttons are native disabled buttons without handlers. No requests, timers, writes, or local recipe-control state are added.
- No source means NOT CONFIGURED/NO DATA and dashes, not a fabricated0%, offline alarm, READY state, or default3:1 recipe. Stale/test data is suppressed by the existing adapter and display helper. Recipe/cycle fields remain unavailable because they are absent from the normalized contract.
- Explicit mixer feedback shows RUNNING/STOPPED and fault state, never command acknowledgment as operation. Mode/assigned barrel appear only if explicitly available. Explicit silo alarms receive a separate ALARM label; LOW/NORMAL/HIGH are source display bands only.
- Hidden technical settings, brightness, reset, I/O controls and touch-debug overlays are not ported.

Scope: only /monitoring/pa/barrels presentation. Existing generic components, configs, adapters, contracts and tests preserved. No SQL, backend, firmware, telemetry or NJ changes.

Mobile silo labels are enlarged relative to the source to remain readable in the two-column layout.

## Farmplast presentation refinement

The current web view uses the standard PA background, header and back link. Four panel-inspired silo illustrations appear above three compact, centered mixer feedback blocks. The standalone panel frame, duplicate screen heading, screen switching, RAW readout and command/recipe buttons have been removed. Source level colors/shapes and panelDisplay helpers remain unchanged. Desktop shows the whole process together; tablet uses two silo columns and mobile one. Mixer priority is operation, mode, assignment, then explicit fault feedback. This supersedes the earlier two-screen presentation description above; it adds no controls or telemetry.
