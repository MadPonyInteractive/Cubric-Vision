# 03 — Spin a Pod & install

> Live Pod ops are **USER-only**. Agent guides; user clicks Deploy and runs the
> shell. Agent has no usable SSH on an ephemeral Pod.

## ⚠️ BEFORE you spin: is a Pod actually worth it? (2026-06-23 lesson)

**The Pod is faster for GEN, but the INSTALL is a big front-loaded tax.** A full LTX
set is ~60–80GB pulled over a datacenter route that is NOT guaranteed fast (HF Xet
throttles, Civitai 403s — see 04). One bad-route session burned **~2 hours + ~$2
just on install** and never reached a single test — local (~100s/gen) would have
finished the test queue in that time.

Rule of thumb: **spin a Pod only when expected gen-iteration volume >> install
cost.** A seed/strength HUNT (dozens of gens) → Pod wins. A handful of decider
tests → stay LOCAL; the install tax eats the speed win. When unsure, start local;
escalate to a Pod only once the iteration count justifies the ~1hr+ setup.

### NEVER run the install script in two terminals at once

Two `install_models_*.sh` (or two `aria2c` on the same file) **fight over the same
`.part` + signed URL** — one downloads (CN:16, DL>0), the other flatlines (CN:0/1,
DL:0B) forever, and they reset each other. Looks exactly like a "stuck" download but
it's self-inflicted. **One install process at a time.** If you see one terminal at
CN:16 moving and another at CN:0/DL:0B frozen, Ctrl+C the frozen one — the live one
finishes alone.

## Deploy

1. RunPod → Templates → **Cubric Vision Builder** (id `2brluktxb4`) → Deploy.
2. **GPU:** any ≥580-driver card (cu130 runs Ampere/Ada/Blackwell — 3090/4090/5090/
   A-series; NOT Blackwell-only). A model's own precision still gates the card
   (mxfp8 = Blackwell-only; the LTX set is bf16/fp8_scaled → runs on 3090/4090).
   L40S (48GB) is a good speed/VRAM authoring pick.
3. **Additional filters → NVMe** (RunPod defaults to slower SSD).
4. **Disk + persistence — pick ONE:**
   - **Stop-and-resume:** small container disk (~20GB) + **network/volume ~150GB+**
     at `/workspace`. `start-builder.sh` roots models on a volume ≥40GB there.
     Volumes survive Stop AND Terminate, re-attach to a future Pod → zero
     re-download. Some datacenters don't offer volumes for the GPU you want.
   - **Ephemeral:** big container disk (~150GB), no volume. Models wiped on **Stop**
     (survive Restart). Fine for a one-session test.
5. Connect **8888** (Jupyter — terminal + drag-drop work) and **8188** (ComfyUI).

## Install (run on the Pod — Jupyter terminal on 8888 OR RunPod Web Terminal)

```bash
cd /opt/ComfyUI
bash /opt/install_nodes.sh            # custom nodes
bash /opt/install_models_ltx23.sh     # ~68GB LTX-2.3 weights
```

- `install_nodes.sh` **skips existing dirs**. If a node was released since the image
  was built (e.g. new reroute nodes), `git pull` it:
  `cd custom_nodes/<pack> && git fetch && git pull --ff-only`. (Registry-publish ≠
  GitHub-push — confirm `git log origin/main` has the commits; if registry-only,
  install via Manager.)
- `aria2c` **preallocates** the full file size upfront ("Allocating disk space" /
  FileAlloc at low %). That's the prealloc artifact, **not a stall**.
- Jupyter on this Pod is **flaky** on long silent steps (terminals look frozen but
  work; file-tree won't expand subfolders — only shows root). Prefer the RunPod Web
  Terminal for long installs.

## THEN: one clean restart

After ALL installs, do **ONE** RunPod console **Restart Pod**. This registers
C-extension node packs (KJNodes) at a clean boot — the Manager "Restart" button does
an in-place reimport that leaves them red ✗.

**NEVER `pkill -f main.py`** — it cascades and kills every Jupyter terminal.
aria2c `-c` resumes any partial on re-run, so a terminal cascade loses no bytes —
but `pkill` still kills your terminals, so just don't.

## Restart vs Stop vs Terminate (what survives)

| Action | Container disk | Volume |
|---|---|---|
| **Restart Pod** | survives | survives |
| **Stop** | WIPED | survives |
| **Terminate** | gone | survives (manual volume-delete only) |
