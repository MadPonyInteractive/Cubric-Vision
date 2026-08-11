# MPI-541 — checklist

The first Pod is gone, so the next H3 download IS the experiment. Capture in this
order — step 1 is the one that decides everything and is easiest to lose.

- [ ] **Before installing anything**, open the Pod's **Container** log tab (not
      System — System only carries RunPod's own OOM warnings) and leave it open.
      What settles the diagnosis:
      - `[cubric] installed huggingface_hub for the hf_xet transport` at boot, or
        `already present`.
      - During the install: the ABSENCE of `[cubric] hf_xet path failed (…); falling
        back to httpx` means the native Xet path ran. Its presence means the
        hypothesis is dead and the real consumer is elsewhere.
- [ ] Watch the app's reported speed. ~650 MB/s = Xet. ~1.7 MB/s = the bridge, which
      is the pre-MPI-491 behaviour and cannot be what OOMs a box.
- [ ] Watch the Pod's **Telemetry** memory graph against the download. A sawtooth
      climbing to the 4 GB ceiling names the transport; a flat line does not.
- [ ] Note the Pod's RAM on the Details tab. The first one was 2 vCPU / 4 GB. If the
      next is bigger and it survives, that is evidence too — the transport is not
      bounded to the box either way.

## Then the fix

- [ ] `HF_XET_NUM_CONCURRENT_RANGE_GETS` low (2–4) in the env block of
      `c:/AI/Mpi/mpi-ci/cubric-vision-pod/wrapper/wrapper.py` (~line 2008, beside the
      existing `HF_XET_CHUNK_CACHE_SIZE_BYTES` and the HIGH_PERFORMANCE comment).
- [ ] `./publish-runtime.sh dev` → restart the Pod → re-run the same install. **No
      image rebuild** — wrapper.py and start-cpu.sh are R2-floated on the dev channel.
- [ ] Only `publish-runtime.sh promote` once it holds, and never `stable` directly.
- [ ] Record the throughput cost. Bounding concurrency trades speed for surviving;
      if it drops back toward the bridge's 1.7 MB/s the trade is not worth it and the
      answer is a bigger download box instead.

## Do not

- Do not chase this as an MPI-539 symptom. No generation was involved in the second
  OOM; the app was doing nothing but downloading.
