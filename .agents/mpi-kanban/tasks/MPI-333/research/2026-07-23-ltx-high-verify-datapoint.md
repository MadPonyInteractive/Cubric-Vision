# MPI-333 - the "full SHA256 re-read" suspect looks WRONG (2026-07-23)

## What happened

User installed **LTX 2.3 High (61.5GB, the largest weight set we ship)** onto a RunPod
network volume from a CPU download Pod, on the fresh `v0.17.0-dev-cpu` image.

- Download ran at **202.7 MB/s** (aria2, ~1.6Gbps - saturating).
- **The verify phase was FAST.** User: "already verifying at this point it was quite fast",
  then "this was quite fast verifying ... It's already verified LTX."

## Why that matters

The card's leading suspect is "full SHA256 re-read off volume vs hash-while-streaming
(MPI-296)". The re-read is REAL - `_sha256_file(part)` in `wrapper/wrapper.py` (the
`models:install-verifying` block) hashes the finished file off the volume in 8MB blocks
after the download completes, with `asyncio.to_thread`. But it just processed 61.5GB and
was fast.

**So per-byte re-reading is not the bottleneck.** Optimising it (e.g. aria2c's own
`--checksum=sha-256=<hex>`, which verifies during the download and would remove the second
pass entirely) would be a real improvement but would NOT fix the symptom the card is about.

## Better hypothesis: per-FILE fixed overhead, not per-byte

The slow case the user remembers is **Krea2**, and the shape differs sharply:

| card | dependency entries | bytes |
|---|---|---|
| `ltx-23` (High) | 12 | 61.5GB (~5GB/file) |
| `krea2` | 27 | far less total, many small files |

Krea2 has 2.25x the file count at a fraction of the bytes. Each file carries fixed cost:
its own aria2c process spawn, its own SSE install lifecycle, its own
`_manifest_record_model` write (atomic tmp+rename onto the network volume), its own hash
open/close. That scales with FILE COUNT, not size - which matches "big single-file model
verifies fast, many-small-file model drags".

## Next step to settle it

Time a Krea2 install on the same Pod and compare seconds-per-file, not seconds-per-GB. If
per-file cost dominates, look at the manifest write (one atomic volume write per file) and
the aria2c spawn cost first.

Alternative the user raised - "maybe our build benefited something" - is unlikely: wrapper
0.2.36 -> 0.2.37 was hot-store evict on delete + pipPins parity, and the ComfyUI core bump
does not touch the wrapper download path. Not disproven, just unsupported.
