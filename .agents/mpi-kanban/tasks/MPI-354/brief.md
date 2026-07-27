# MPI-354 — Klein 4B wiring: session record

Long-form log for the card (the `description` field is the older running log).

## Session 5 — 2026-07-27 (dep reconcile, R2 upload, template conversion)

Resumed from handoff `6e65b5cb`. Its `next_action` was: reconcile the declared deps
against what the master template actually loads, present the delta and the turbo
in/out call, then upload.

### The delta that was found

Reconciled by exhaustive scan of the 315-node master template (every widget value
ending in a weight extension), not by inspection:

| finding | resolution |
|---|---|
| dep pointed at `flux-2-klein-**base**-4b-int8-convrot`, graph loads the **distilled** weight | repointed `klein-4b-transformer` (4.07 GB, sha `ac629fa6...`). The declared base file was **missing from disk entirely** — the upload would have failed on it |
| `flux2_klein_4b_refcontrol_depth.safetensors` loaded by node 143, **undeclared** | new dep `klein-lora-refcontrol-depth` (92 MB, sha `65ec4c71...`) |
| turbo LoRA declared but its node is bypassed AND severed (zero outgoing links) | **dropped** (user call) — dep deleted, 0.79 GB not uploaded, tombstone comment left explaining why the node survives |
| `4x_NMKD-Siax_200k.pth` | no-op — already the shared `4x-NMKD-Siax` engineAsset, already on R2 |
| `depth_anything_v2_vits.pth` | no-op — auto-downloaded by the `comfyui_controlnet_aux` node dep |
| orphan `depth_anything_v2_vitl` preprocessor + `AIO_Preprocessor`, both with unconnected required inputs | pruned by the handler |

### Verified, not assumed

- **14/14 declared sha256 re-verified against disk** (`sha256sum -c`, exit 0) before any
  byte went public.
- **R2 had zero Klein objects** before this session; write access probed with the
  smallest real dep first.
- **Dep-vs-graph reconcile closed in BOTH directions**: 16 weights in the baked runtime
  graph, 0 unmapped; 0 declared Klein deps the graph does not load.
- Baked `klein_t2i.json`: 184 nodes, 0 dangling links, 0 unknown class types, 0
  missing-required inputs, 0 duplicate `Input_*` titles.
- All 8 `generate_klein.py` guards **negative-control proven** (they fail a
  deliberately-broken graph, so they are not decoration).

### Licences — fully re-swept 2026-07-27

All 11 Klein LoRAs resolved by SHA256. Reproduced the 2026-07-26 table exactly, so the
user's earlier "all ship" call stands unchanged. New: `klein-lora-refcontrol-depth` is
the most permissive weight in the set. `klein-style-anime` (n_Arno) is the one requiring
credit — now discharged in data via a `credit` block on the dep, rendered by `MpiAbout`.

The CivitAI API **region-blocks** and needed a VPN; the by-hash endpoint returns a stub
`model` with null permissions, so `modelId` must be followed to `/models/<id>`. Both
traps recorded in `docs/models/klein/licences.md`.

The VPN also **throttled the R2 upload ~15x** (4.4 MiB/s to ~300 KiB/s) — do the licence
sweep before or after an upload, not during.

### Injection gate caught a real defect

`validate-injection-rules.mjs` rejected the first export: two nodes titled `input_mask`
(296 `MpiLoadImageFromPath`, 298 `MpiString`). Only 298 could receive an injected value
(296's `string` is a link), so masks would have worked or not depending on which node
resolved first. User fixed in the graph and re-exported; the title now sits on the
`MpiString` as `Input_Mask`, matching all nine other shipped mask graphs.

### Docs

`docs/models/klein/README.md` documented the REVERSED base+turbo decision as current —
actively hazardous. Rewritten, and split to stay under the 200-line ceiling:
new `licences.md` and `refcontrol.md` (the depth op: grayscale root cause + style x depth
exclusivity). `removal.md` gained the not-shipped adjacents and had its now-dissolved
tier trap corrected. All four docs within the ceiling; `docs/models/README.md` now routes
Klein, which it did not before.

## Still open (was in the handoff, not done this session)

- `progressStages` — count bars LIVE, per `wf_type`, enhancer ON and OFF.
- `ModelDef` in `models.js` (low tier; `negativePrompt` FALSE, `turboToggle` FALSE).
- Re-measure VRAM on the distilled int8 weight (the ~13 GB figure was bf16).
- **SHIP GATE MPI-359**: `node_lock.json` pins ComfyUI-MpiNodes at a commit with no
  `MpiStyleSelector` / `MpiStyleLoras` source. Klein, Krea2 and Qwen-Edit graphs all use
  them. Push the node pack, bump the pin, verify a from-scratch install.
