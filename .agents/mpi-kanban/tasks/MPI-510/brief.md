# MPI-510 - an interrupted remote install strands its partial, then blocks its own retry

All three symptoms below were measured live on 2026-08-10 on a CPU download Pod
(wrapper 0.2.44, EU-RO-1, 40GB throwaway volume) while closing MPI-483 and MPI-481.
They share one route - `_startRemoteDownload` in `routes/downloadManager.js` and the
wrapper's install/delete pair - so they are one card, not three.

## 1. The partial is stranded, and nothing sweeps it

A Pod STOP kills the container before `_download_hf`'s `shutil.rmtree(stage)` runs, so the
staging tree survives. Measured: **11.5 GB** of
`text_encoders/<file>.safetensors.part.hfstage/.cache/huggingface/download/....incomplete`
left on the volume after one killed `h3-qwen3vl-32b-clip` install.

Neither cleanup path removes it:

- the wrapper's delete handles `dest` and `dest + ".part"` (wrapper.py ~2597) - not the
  `.hfstage` DIRECTORY;
- `POST /comfy/models/uninstall` for that exact dep answered
  `keptModelFiles: [{depId: "h3-qwen3vl-32b-clip", reason: "already-absent"}]` while the
  11.5 GB sat there, because the final `.safetensors` really was absent;
- the orphan sweep maps volume files back to deps (it correctly swept
  `controlnet-union-flux`), so a path that maps to no dep is invisible to it.

The aria2 side strands just as much: MPI-483 measured that a `.part` is allocated at its
FULL declared length within ~2s of starting, so a kill at 8% still leaves ~13.3 GB.

## 2. The disk gate counts that leftover against the dep's own retry

`_download_aria2` removes the old `.part` before it starts ("clean slate", MPI-136) - but
the app's free-space gate runs BEFORE the install and sees the leftover as used space.
Live, twice:

```
[WARN] [download] remote install blocked - volume full: need 13.3 GB, have 12.0 GB free of 37.3 GB
```

for `wan-22-i2v-high`, whose own stranded 13.3 GB `.part` was the occupant. A user whose
install was interrupted therefore cannot restart it until they free space by hand - and the
UI gives them no way to see or delete the leftover.

## 3. A gate-blocked install sits at `queued` forever

When the gate refuses, `GET /comfy/downloads/status` kept the dep at `status: "queued"`,
`downloadedBytes: 0`, for 4 minutes with no error state and no terminal transition
(measured 04:11-04:15Z). The `[WARN]` line is the only signal, and it is server-side.
Whatever the renderer shows, the job record itself never settles.

## Where to look

- `routes/downloadManager.js` - `_startRemoteDownload`, the free-space gate (~2335), the
  orphan sweep, and `_filterDepsForEngine`'s neighbours.
- `c:/AI/Mpi/mpi-ci/cubric-vision-pod/wrapper/wrapper.py` - `_download_hf` (stage dir,
  `shutil.rmtree` on the exception path only), `_download_aria2` (clean-slate remove), and
  the delete route's `for p in (dest, dest + ".part")`.
- `GET /remote/pod/ls` is the instrument: `models_files` lists the stranded paths by name.

## Not a 1.4 gate

Reaching it needs an install interrupted by a Pod stop/kill/crash, which is not a normal
user path, and MPI-483/MPI-481 both closed without it. Fix order suggestion: (2) first -
it is the one that traps a user - then (1), then (3).
