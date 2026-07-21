# MPI-194 Plan — volume-pod hot-store for big weights (the MPI-191 fix)

## Goal
On volume Pods, any weight file >= the size threshold is served from the container disk
(local NVMe), never from the network volume, from its first use onward. LTX warm gap goes
36s -> ~9s, warm full ~47s -> stock-parity ~35s once the whole hot set is staged.

## Evidence base (do not re-litigate — all live-proven 2026-07-05, full trail in
## docs/builder/research/pod-perf-investigation.md SOLVED banner)
- Network volume read bandwidth: dd-measured 750 MB/s. 40GB transformer re-read per stage
  re-fault = the entire 36-39s gap. cp to disk on the SAME pod -> 9s gap.
- Re-fault reads the fastest tier holding the bytes: page cache -> disk -> volume. Product
  pods reliably fall to the volume tier (models installed in past sessions = nothing cached;
  aimdo pins ~90% of host RAM = cache can't hold 40GB). Disk = deterministic tier-2.
- ACQUITTED, never re-test: wrapper (direct-8188 identical), launch flags, dup node packs,
  torch minor, ComfyUI 0.27-vs-0.26.2, hardware, aimdo version.
- Q8 GGUF (22GB) paid the same tax as bf16 (40GB) -> threshold, not format/model-specific.
- Ephemeral pods (CUBRIC_EPHEMERAL=1, MPI-78) already root models on the disk — UNTOUCHED.

## Requirements (user-settled 2026-07-05)
1. **Size threshold, not model names:** stage files >= ~15GB (constant, one place, documented).
   Today that selects only the LTX transformer (40GB) — and the 11GB TE is deliberately
   OUT at 15GB (decide in design review: cold path re-reads it ~3x = ~45s of cold; lowering
   to ~10GB would include it and needs the disk budget check).
2. **Sticky:** one copy per pod lifetime. No re-copy between gens, no delete on model switch.
   Evict LRU only when the disk is actually short of space for a NEW stage.
3. **Volume remains the durable library** (survives pod delete; avoids ~10MB/s internet
   re-downloads). Disk is a cache — losing it is always safe.
4. First-use staging must be VISIBLE (progress toast/SSE like a mini-download, ~55s for 40GB),
   not a silent stall.

## Implementation sketch (design-review before coding)
- **Wrapper** owns the hot-store: dir on the container disk (e.g. /opt/ComfyUI/models/... or a
  dedicated /cubric-hot with per-category subdirs), tracked in its manifest. New op (or an
  extension of the existing install flow): "ensure-hot(file list)" — cp from volume, sha-verify
  (hashes already in dependencies.js), emit progress SSE. Wrapper already has install/progress
  machinery — extend, don't parallel-build.
- **Path resolution:** the hot copy must WIN over the volume copy. /opt/ComfyUI/models is
  scanned before extra paths (live-verified tonight: the /opt cp took precedence with zero
  config) — staging INTO the default models tree may need NO yaml change at all.
- **App:** at gen preflight (resolveDeps already lists dep files + sizes), call ensure-hot for
  files >= threshold on the REMOTE volume-pod path only. Engine-split rule applies: sweep ALL
  call sites via the one resolver (comfy_engine.md § Engine Split).
- **Create payload:** CONTAINER_DISK_GB 50 -> ~80 for volume GPU pods
  (routes/remotePodLifecycle.js:138,445). Cost delta $0.004/hr — approved by user in principle.
- **Ship path:** wrapper.py + start.sh via publish-runtime.sh (NO image rebuild; Git-Bash not
  WSL `bash`; verify by re-fetching https://pod.cubric.studio/vision/stable/wrapper.py).

## Open design questions (settle before implementation)
1. Threshold value + whether the TE (11GB, re-read ~3x cold) makes the cut.
2. Stage lazily at first gen (adds ~55s to first gen, visible) vs eagerly at pod boot
  (hides it in the ~2min boot the user already waits through) — boot-eager may be strictly
  better UX when the connected project's model is known.
3. RAM-floor alternative (MPI-160 minMemoryInGb): big-RAM hosts get tier-1 page cache for
  free but cost more than disk and are eviction-roulette — document as rejected-or-hybrid.
4. Multi-model disk budget: 80GB holds LTX's set + margin; two big models = eviction path
  must actually work.

## Verification
- Volume pod, LTX: first gen shows staging progress once; warm gap ~9s (log timestamps);
  second+ gens NO re-staging; pod recreate re-stages once.
- Small-model gen (Wan): NO staging triggered.
- Disk-pressure path: force-fill the disk, confirm LRU evict + successful stage.
- MPI-192 door (.expose-comfy marker) available for direct log/UI checks; delete marker after.

## Verify mode
user-ux (live pod gens are user-run; agent self-verifies staging logic, path precedence, and
publish offline first).

## Out of scope
- MPI-193 (dup node-pack quarantine) — separate card, plan ready.
- Baking weights into the image (11GB image contract, MPI-189) or dropping the volume.

---

## DESIGN DECISIONS — settled with user 2026-07-05 (resolves the 4 open questions above)

1. **Threshold = 15GB PER SINGLE FILE.** Constant, one place, documented. Corrected sizes:
   LTX text-encoder is **9GB** (not 11) → OUT. **Wan = ~14GB per model** → OUT (under 15).
   Today the threshold selects ONLY the LTX 40GB transformer. It is deliberately a real
   size gate, not LTX-hardcoded, so the next big model auto-qualifies.
2. **Lazy at FIRST GEN, not boot-eager.** User's reason (decisive): boot-eager can't know
   the NEXT model the user will run. Stage on gen preflight (resolveDeps lists file+bytes).
   First gen with a ≥15GB file shows a one-time visible staging toast (~55s for 40GB);
   every later gen is fast. No boot-time model hint needed.
3. **STICKY + LRU EVICT IS REQUIRED (not optional).** One copy per pod lifetime; a second
   big model ALSO stages IF the disk has room; if NOT, EVICT least-recently-used staged
   file(s) to make room, then stage. Eviction must actually work — it is not a stub. At the
   50GB disk (below) LTX 40GB leaves ~10GB, so two ≥15GB models cannot coexist → switching
   between two big models evicts each time. Acceptable today (LTX-only); the logic must be
   correct for when a 2nd model lands.
4. **Container disk STAYS 50GB.** No bump now — LTX 40GB fits alone; the 9GB TE and 14GB Wan
   stay on the volume. NO remotePodLifecycle.js change this card.
   **BUT: document the 15GB threshold + the disk-bump rule durably** (docs/runpod-* or the
   perf doc): "hot-store stages single files ≥15GB to the container disk; disk is 50GB and
   fits ONE ≥15GB model (LTX). When a model arrives whose ≥15GB hot-set does not fit in 50GB
   free (e.g. a 60–70GB weight, or a 2nd big model that must coexist), bump CONTAINER_DISK_GB
   in remotePodLifecycle.js create payload." So a future big model triggers the bump knowingly.

### Consequences for implementation
- No create-payload/disk change → the whole fix is wrapper.py + start.sh + app preflight,
  shipped via publish-runtime.sh (NO image rebuild), SAME as MPI-193.
- Hot-store state (what's staged + last-used for LRU) lives on the CONTAINER DISK (pod-lifetime,
  not the volume manifest) — lost on pod delete = safe (disk is a cache).
- Threshold constant needs to exist BOTH app-side (preflight decides which files to request)
  and wrapper-side (defensive) — keep them in sync or have the app drive it (app passes the
  file list; wrapper just stages what it's told + enforces its own floor). Prefer app-drives:
  app already has per-file bytes from resolveDeps.
