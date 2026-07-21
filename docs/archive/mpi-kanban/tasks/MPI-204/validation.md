# MPI-204 Validation

**Verify mode:** user-ux — must open the raw ComfyUI web UI in a browser from a live dev Pod.

## Results

- 2026-07-06 (user, live, dev source run, pod 4xxligyiohwabz / RTX 4090):
  Both halves user-verified ("thank you, this is very useful"):
  1. Frontend: "Open ComfyUI (dev)" link renders in RunPod Settings when the
     remote engine is READY (screenshot: Settings panel, "Remote engine: ready",
     link visible under "Open in RunPod console").
  2. Backend + end-to-end: clicking the link opened
     `https://4xxligyiohwabz-8188.proxy.runpod.net` → raw ComfyUI loaded in the
     browser (screenshot: ComfyUI graph UI, "Unsaved Workflow"). Proves the
     8188 port was actually exposed at Pod-create time under `_devMode`.
- Gate proven correct by construction: 8188 push + link are both gated on
  dev_mode (BUILD_HASH === 'dev'); a release build (real hash) opens neither the
  port nor the link. Not separately tested on a release build — dev_mode
  derivation is shared with main.js/app_config.js and already release-proven.

## Notes

- Reload vs restart: renderer change (link) picks up on app reload; backend
  change (`_devMode` + port push) is a `require`d Express module → needs a full
  app restart to take effect. Port only exposes at Pod CREATE, not reconnect.
- No auth on 8188 by design (dev-only, obscure podId URL). Do not paste the URL
  publicly.

## Files
- routes/remotePodLifecycle.js (server-side _devMode gate + 8188 expose)
- js/components/Compounds/LandingPages/MpiRunpodSettings/MpiRunpodSettings.js (dev-only Open ComfyUI link)
