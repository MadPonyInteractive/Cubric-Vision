# MPI-104 Plan

1. MpiSettings.js: add a console link in the RunPod section (near "Remote engine:
   <status>"). Resolve target: connected → `https://console.runpod.io/pods?id=<podId>`,
   else `https://console.runpod.io/pods`. Open via shell.openExternal (IPC).
   → verify: link visible; click opens the right URL in the external browser.
2. Style per existing Settings hints/links (BEM, CSS vars, icons.js). No raw SVG.
   → verify: matches surrounding Settings styling; no hardcoded colors.

App-side only, no rebuild.
