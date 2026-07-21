# MPI-209 Validation

**Verify mode:** user-ux (live, on a CPU download-pod + 5090 saved in RunPod settings)
**Result:** PASS — user-approved final completion 2026-07-06.

## Auto-verified (pre-live)
- `node tests/resolve-model-deps.test.cjs` — 14/14 green (incl. new `archVariantOptions` case).
- `npx eslint` — clean on all touched files.
- ESM union smoke — keep-both fetches both transformers, shared VAE deduped once.
- `defaultArchTokens` priority — CPU-pod + 5090 saved → `['blackwell']`; live GPU wins over saved.

## Live-verified (running Electron app, CPU download-pod, 5090 saved)
1. **CPU-pod smart default (the headline fix)** — no live GPU → fell to saved
   `runpodConfig.gpuType` arch → **Blackwell (mxfp8) pre-selected**, NOT the old
   silent fp8. Classifier caught "RTX PRO 4000 Blackwell" via the `\bblackwell\b`
   branch (the "4000" digit match fails on "RTX PRO 4000" — space breaks `rtx\s*\d`).
2. **Toggle UX** — two arch toggles with card-driven labels+sizes
   (`RTX 50 Series (Blackwell) · 24.1GB` / `RTX 40 & Older · 25.2GB`), active = pink.
3. **Size recompute + dedupe** — Blackwell-only 44.6GB, modern-only 45.7GB, both 69.8GB.
   Shared base ~20.5GB counted once. Math consistent.
4. **Single-arch install** — Blackwell-only fetch = 41.1GB (base + mxfp8), NOT 69.8GB.
5. **Section sort** — after the null-arch bug fix (see below), the partly-installed
   arch-variant card sorts to the top INSTALLED section (was wrongly sinking).
6. **Swap** — toggled Blackwell off + modern on → Update → confirm ("Remove RTX 50
   Series (Blackwell)... Also installs: RTX 40 & Older") → mxfp8 deleted + fp8 fetched.
   Proven terminal-free via `/comfy/models/check` in DevTools console (CPU pod has NO
   web terminal; the route forks to the pod wrapper when remote):
   - before: `mxfp8 installed:true, fp8 installed:false`
   - after:  `mxfp8 installed:false, fp8 installed:true` — single-weight swap on the
     volume, never a double-install.

## Bug found + fixed DURING live verification
- **Null-arch section-sort mismatch.** On a CPU pod (no live GPU → null arch),
  `_installedOpsOf` unions BOTH variant weights → reads empty → an installed
  arch-variant card wrongly dropped to the uninstalled section, while the card's own
  `anyInstalled` (which counts `_installedArchOf`) said installed. Fixed: added
  `_installedArchOf(m).length > 0` to the `isInstalled` section predicate in
  `renderList`. Lint clean, verified live (card jumped back to top INSTALLED).

## Not yet live (deferred, logic-proven)
- **Step 4 generate-time guard** (`_ensureArchWeightOnDisk`) — needs a live Ada/modern
  GPU Pod to fire (mxfp8 on disk, fp8 missing, hit Generate → expect "Install &
  Generate" dialog, not `unet_name not in []`). Same resolver + install path as the
  rest (all live). Re-verify on the next Ada Pod session.

## UX decisions (user-approved)
- Swap confirm dialog keeps the "Uninstall" title/button (body text explains the
  add+remove). User: "it's the right UX, let's leave it." (option B, no code.)
- MPI-207 connect-toast (`_maybeNotifyArchChange`) KEPT — harmless proactive nudge;
  the generate-guard is the hard net.

## Not a bug (investigated)
- RunPod "6GB disk usage" telemetry = the pod CONTAINER disk (ComfyUI/python/wrapper
  runtime), NOT the model weights — those live on the 150GB VOLUME. Expected.
- LTX 2.3 High showing PARTIALLY INSTALLED = shares commonDeps (VAE/clip/LoRA/nodes)
  with Balanced (same modelFamily). Expected.
