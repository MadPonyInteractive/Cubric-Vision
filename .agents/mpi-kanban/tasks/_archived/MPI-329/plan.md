# MPI-329 Plan

## Goal
Kill the ~2min remote model-SWITCH cost (warm same-model ~8s). Weeks-long saga.

## ROOT CAUSE FOUND (2026-07-23, live) — it was the network volume for fits-VRAM models
Fits-VRAM image models (Krea2 13.5GB / Qwen 20.5GB / TEs 5-9GB / VAEs / LoRAs) were left
on the `/workspace` network volume because `HOT_STORE_MIN_GB=20` only staged the LTX 42GB
transformer. aimdo pins ~90% of host RAM (`Enabled pinned memory 231803` = 231GB) →
page cache starved → every model switch random-reads the volume. Proven on a 4090:

| leg | from volume | from container disk |
|---|---|---|
| cold first gen | 76.5s | 20.7s |
| **switch (evicted reload)** | **80.4s** | **9.0s** |
| warm same-model | 7.7s | 8.1s |

Krea2↔Qwen swap cycle, both disk-staged: **3–19s per switch** (vs 80s volume). Copy cost
= one-time ~24s. The fix is staging the fits-VRAM model set to the fast container disk.

Two regimes (this resolves the "LTX disk-staged still 2min" paradox):
- **fits VRAM** (Krea2/Qwen/Chroma): volume-read-bound → staging = 10× win.
- **doesn't fit** (LTX 42GB bf16 > 24GB): aimdo streams per-stage, source-independent →
  staging can't help. LTX's SLOW part yesterday was (a) its 11GB TE read from volume
  (below the 20GB gate → ~50s of the 2min40) + (b) VRAM streaming. Balanced-tier story.

## RULED OUT this session (do NOT re-chase)
- **torch 2.10 rebuild** — MPI-191 already live-proved our image slow on BOTH 2.10 (~60-93s)
  and 2.12 (~86s); only STOCK image fast. Torch minor ≠ lever. (2.12 Dockerfile drift is
  real hygiene debt but NOT this fix.)
- **dup node packs** — MPI-193 dedup VERIFIED working (0 dups, 0 IMPORT FAILED).
- **--highvram** — can't help a switch (incoming model still loads; A must evict); OOMs LTX.
- **API/wrapper path** — browser-direct = app times. Cleared.

## THE FIX — edits in tree, NOT committed, NOT live-verified end-to-end
1. `js/services/commandExecutor.js`: `HOT_STORE_MIN_GB` 20 → **0.1** (stage transformer +
   TE + VAE + LoRAs, not just the 42GB LTX transformer). DONE (edit in tree).
2. `routes/remotePodLifecycle.js` pod-create env: `CUBRIC_HOT_STORE_MIN_BYTES=100000000`
   (drops the wrapper's baked 15GB floor to match). DONE (edit in tree).
3. `routes/remotePodLifecycle.js`: **DYNAMIC container disk** — a volume GPU Pod mirrors
   its disk to the network-volume size (`_volumeMatchedDiskGb` → one listVolumes lookup)
   + 5GB headroom, clamped [100,600], fallback 200 if the size can't be read. Replaces the
   static `CONTAINER_DISK_GB=150`. Mirror ≥ whole model universe → wrapper LRU never evicts.
   Unit-tested: `tests/pod-volume-disk.test.cjs` (10/10 with the existing disk test).
4. **NEW: "Stage all models on connect" RunPod-settings toggle** (`stageOnConnect`, default
   OFF). ON = commandExecutor prefetches EVERY installed model's weight set to the Pod disk
   on the connect edge (`_prefetchInstalledModels`, armed on `remote:connection`, consumed on
   the connect-edge `models:checked`), so the first gen is instant. OFF = lazy gen-preflight
   (copies only what's used). Files: storage.js (config field), MpiRunpodSettings.js (plate +
   wire), commandExecutor.js (prefetch + `_ensureRemoteHotStore(id, null, {silent})`).

## DESIGN DECISIONS — RESOLVED with user 2026-07-23
1. **Disk** — DYNAMIC mirror = `vol.size + 5GB`, clamp [100,600], fallback 200. Ephemeral
   unchanged (user-chosen `containerDiskGb`). Rationale: volume is the source of every model,
   so disk ≥ volume ⇒ hot-store holds the full staged set and LRU eviction NEVER fires.
2. **Stage scope** — everything ≥0.1GB (the active op's full set). Dynamic disk removes any
   space pressure, so no need to cap style-LoRA count.
3. **LTX cap** — REINSTATED as VRAM-RELATIVE (2026-07-23, after the live contention bug). In
   `_ensureRemoteHotStore`, skip any SINGLE file whose size > the pod's VRAM (`/remote/pod/specs`
   → vramGb, cached per gpuType). WHY the reversal: the stage-on-connect prefetch staged the LTX
   42GB transformer in the background; the wrapper serializes ALL hot-store ops under one lock
   (wrapper.py _hot_lock), so a Krea2 gen — already staged — stalled for MINUTES behind the 42GB
   copy (user-observed live). A fixed 30GB constant would hurt 96GB cards; VRAM-relative keeps
   staging LTX on a card where it fits (benefits) and skips it where it can't (24GB 4090). Applies
   to BOTH prefetch and gen-preflight (one filter, shared path). Keeps LTX's 11GB TE staged.
4. **Trigger** — user chose OPTION C: a toggle. "Stage all on connect" (prefetch) vs "on
   generation" (gen-preflight, default). Both ship. Model-select rejected (peeking ≠ using).

## Mechanics confirmed from the wrapper (wrapper.py)
- Copy is STICKY (one per pod lifetime); a staged file just bumps its LRU ts thereafter
  (`_hot_ensure_one` L1548). NOT re-copied per gen.
- Eviction is LAZY (`_hot_evict_for` L1458): fires only when a NEW stage needs room AND
  `free < need + 3GB margin`. With the mirror disk it never fires.
- LRU already implemented (oldest `last_used` first, never the incoming). "Big-stays vs LRU"
  is moot under a mirror disk — nothing is ever evicted.

## Verification
**Verify mode:** user-ux (needs real app end-to-end: app RESTART to pick up the backend
env + disk const → fresh pod → switch between two image models → observe fast switch +
staging toast). Renderer change (HOT_STORE_MIN_GB) alone is Ctrl+R; the wrapper floor +
disk only apply to NEW pods after an app restart.
Volume = EU-RO-1 `9t3awufudk`. Dev pod (dev app auto-exposes 8188). Driver + POD/token in
scratchpad driver2.py pattern (regenerate token per new pod via /remote/ws-token).
