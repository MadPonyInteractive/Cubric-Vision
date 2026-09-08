# MPI-660 — Flow outputs are filed under the op key

Flow media is named from the operation key. `flowChatterBox` is the op behind the Flow
titled **Text to Speech**, so its cards read `flowChatterBox_001` — a name that appears
nowhere in the Flow Library, and the card's own chip says "FLOW: TEXT TO SPEECH" right
above it.

Fix: an optional `filePrefix` on a CommandDef, threaded client → `/project/save-generation`,
used as the sequence prefix when present. The `operation` key itself is NOT renamed — it is
stamped in every existing sidecar and versioned in `operationRegistry.js`.
