# MPI-85 Checklist

- [x] Boot decouple: add `autoConnectOnStart` flag (storage.js); boot gate now branches on `autoConnectOnStart` (not `enabled`) so an enabled-but-not-auto boot runs the LOCAL engine gate; `_initRemoteBoot` only reached when auto-connect ON (shell.js)
- [x] Gen routing fallback: `_ensureRemoteReady` flips remote mode off + refreshes + falls back to LOCAL via `ensureServerRunning`, with a one-time info toast, instead of throwing the bug-reporter error (comfyController.js)
- [x] Symmetric model re-check: re-run `syncModelInstalled()` on the disconnect edge too → `models:checked` → `s_installedModelIds` → gallery/history `setModelList` swaps stale remote-only selection (shell.js)
- [x] Settings UI: "Automatically connect on app start" sub-checkbox under "Enable RunPod remote engine" (default OFF, hidden unless Enable ON, indented sub-option); Enable hint reworded to "remote available / runs locally until Connect" (MpiSettings.js + .css)
- [x] Verify in-app per brief — confirmed by user 2026-06-15
