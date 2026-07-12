# MPI-192 Validation

**LIVE-VERIFIED end-to-end 2026-07-05** (pods 0lstivan4yh1nf, fw5zdukx36t5n5, 5090):

- `.expose-comfy` marker (or `CUBRIC_EXPOSE_COMFY=1` env) → create payload adds `8188/http` + `CUBRIC_COMFY_LISTEN=0.0.0.0` ✔ (port visible in RunPod Connect tab)
- start.sh env-clobber fixed (default-only assignment, published to R2 stable) → `starting internal ComfyUI on 0.0.0.0:8188` ✔
- ComfyUI `Sec-Fetch-Site: cross-site` 403 fixed via `--enable-cors-header` on non-loopback bind (wrapper 0.2.24, published) → console link opens the web UI directly ✔
- Purpose delivered: enabled the MPI-191 direct-vs-wrapper A/B (wrapper acquitted), surfaced the dup-VHS/stale-volume-packs finding (→ MPI-193), and the volume-bandwidth root cause (→ MPI-194).

Remaining before closing the card: decide whether the door stays a permanent debug feature
(then delete nothing) or gets removed after MPI-193/194 verify (then delete the `.expose-comfy`
marker in the repo root — it currently exposes auth-less ComfyUI on EVERY pod the app creates).
# MPI-192 Validation

2026-07-05 — .expose-comfy marker + CUBRIC_EXPOSE_COMFY=1 path exercised on two app-created pods (ephemeral + volume): 8188 exposed via RunPod proxy, direct /history + /internal/logs/raw + workflow replays all worked; app log confirms opt-in WARN line at create. Marker DELETED at session close — door defaults off; env/marker remain available for future debug pods.
