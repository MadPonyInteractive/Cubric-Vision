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
