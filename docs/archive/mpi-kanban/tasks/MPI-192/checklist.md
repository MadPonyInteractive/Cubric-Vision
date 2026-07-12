# MPI-192 Checklist

- [x] App: opt-in 8188 exposure — `CUBRIC_EXPOSE_COMFY=1` adds `8188/http` port + `CUBRIC_COMFY_LISTEN=0.0.0.0` env at pod create (routes/remotePodLifecycle.js, GPU pods only, warn-logged)
- [x] Wrapper already honors `CUBRIC_COMFY_LISTEN` (wrapper.py:176) — no wrapper change needed for the port
- [ ] USER live: create debug pod with env set, confirm 8188 proxy URL serves ComfyUI web UI
- [ ] USER live: MPI-191 A/B — queue LTX_t2v.json direct on 8188 vs through app, same pod/weights
