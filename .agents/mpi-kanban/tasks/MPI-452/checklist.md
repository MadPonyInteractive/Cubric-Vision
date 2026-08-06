# MPI-452 — app verification runbook

Everything in `validation.md` § Proved was proved against the **engine on 48188**. This is
the app-side pass. Work it top to bottom; each step's **PASS** is the exact thing to look
for, and **WATCH** is the failure that looks like something else.

**Setup already done:** `minimax_h3_audio_vae_fp32.safetensors` (605,254,808 B) was MOVED
out of `G:\CubricModels\vae\` to the session scratchpad so H3 reads as not-installed and the
install can be exercised for only 0.61 GB. Restore command is in `validation.md` § 5c.

Ports: app = **3000**, its engine = **48188**, bench = **8188**. A manual engine left on
48188 makes the app fail to start with "port already in use".

---

## 0. Start

- [ ] App launches, engine reaches ready.

**WATCH:** the bench on 8188 is fine to leave running; only 48188 collides.

---

## 1. Model Library tile + trade table

- [ ] MiniMax H3 tile appears in the Model Library.
- [ ] Tile reads **not installed** (the moved VAE is what makes this true).
- [ ] Open the detail drawer. The VRAM→RAM trade table renders and the figures read sanely
      against ~53 GB of weights.

**PASS:** a plausible ladder, not `NaN`, `undefined`, `0 GB`, or a single row.
**WATCH:** the table is computed from dep `size` strings — `'0.61GB'` etc. A parse failure
shows as a silently wrong number, not an error.

---

## 2. The licence gate — its first real exercise

- [ ] Click **Install**. `MpiLicenceGate` appears **before** any bytes move.
- [ ] The restrictions pane scrolls; Accept is not available until it has been read.
- [ ] Both acknowledgement checkboxes are required.
- [ ] Cancel → nothing downloads, tile stays on Install.
- [ ] Accept → download starts, and it pulls only the missing 0.61 GB file.

**PASS on the ordering claim:** zero network activity to huggingface.co before Accept.
**WATCH:** downloads must resolve from **publisher** URLs (`huggingface.co/Comfy-Org/...`),
NOT `models.cubric.studio`. A mirror rewrite here is a licence problem, not a bug — but
there should be none, `_mirrorUrlsFor` only rewrites URLs under the R2 path prefix.
**WATCH:** a gated model goes async, so its tile correctly STAYS on Install until accept.
That is not a dead button.
**To re-show the dialog:** clear `mpi_model_licence_accepted` in localStorage.

---

## 3. The licence UI written 2026-08-06 (unverified — only rendering is left)

- [ ] Drawer shows a **Licence** field: licence name, then **Powered by MiniMax H3**.
- [ ] **Read the licence** opens the bundled text — `/licences/minimax-h3/LICENSE.txt`,
      the full agreement, in the system browser. NOT huggingface.co.
- [ ] **Request authorization** and **Report misuse** still open their external URLs.

**PASS:** the licence opens at `127.0.0.1:<port>/licences/...` and starts
`MiniMax H3 COMMUNITY LICENSE AGREEMENT`.
**WATCH:** a 404 here means the root-relative URL did not resolve — the file itself is
proven served (200, 17,604 B) and proven staged into the portable, so a failure is in
`openExternal`, not in the file.

---

## Run 1 — 2026-08-06. Steps 1–3 PASS. Three defects, none in the H3 wiring.

Tile, trade table (DISK 53.2 GB), gate ordering, both checkboxes, and the new licence row
(name + **Powered by MiniMax H3** + three links) all rendered correctly. The 0.61 GB VAE
downloaded from the publisher URL in 14 s. Then:

- **A — `Download Failed` after the weights landed. Carded as MPI-459, NOT fixed here.**
  The curated pip pass (`_ensureCuratedPythonDeps`) must replace a package the RUNNING
  engine has imported: `OSError [WinError 5] Access is denied` on `cv2/cv2.pyd`, pip exits
  1. Not transient and not self-healing — `.cubric_python_deps` is stamped only on success
  (it was genuinely absent, this engine was upgraded in place), so every later model
  install repeats it identically. A fresh engine is immune: `cv2.pyd` does not exist yet,
  so nothing is locked. Trigger is a release that MOVES a python dep pin + a live engine.
  **Confirmed by cure:** engine stopped → the identical pip command succeeded, replacing 10
  packages including `opencv-contrib-python-headless-5.0.0.93`. Marker then stamped by hand
  at `engine/.cubric_python_deps` = `9985e35fa0c6db61`, engine restarted, all H3 and
  MpiNodes classes verified registering (1870 classes on `/object_info`).
- **B — the dialog was BLANK, which is why this looked opaque. FIXED.** A double broadcast:
  `_runCustomNodeInstall` emits `download:failed` WITH the reason, throws the same text,
  and the catch at `downloadManager.js` re-emitted it WITHOUT — the later event clobbered
  the good one. Same defect MPI-387 fixed for the dep-level branch; it never reached this
  call site. Now carries `err.message`. **Server code — needs a full app restart, not
  Ctrl+R.**
- **C — 404 on `minimax_h3_preview.webp`. FIXED.** `MpiTileSheet` derives a poster by
  convention (`foo.mp4` → `foo.webp`); every other video model ships one and H3 did not.
  Generated at 480x266 from the preview mp4 via `ffmpeg-static`, matching the 480px-wide
  convention. **Regenerate it alongside the new clip in step 8** — the poster must match
  whatever mp4 ships.

Resume at step 4.

## 4. t2v through the app

- [ ] A t2v run dispatches and completes.
- [ ] Progress bar reads **1/2** then **2/2** (`PROGRESS_STAGES` single: 2).
- [ ] Output is video **with** audio.

**WATCH — the expensive failure:** injection **silently skips** an `Input_*` title matching
no node. No error, no warning. Confirm these all landed by their effect, not by trusting the
run finished: `Input_Duration`, `Input_Width`/`Input_Height`, `Input_seed`,
`Input_Positive`, and the six `Input_Lora_*` slots. **A wrong-but-plausible video is the
failure mode** — a run that "works" is not evidence.
**WATCH:** frame counts snap to `n % 17 == 5` at 24 fps. A 2 s request → 56 frames. That is
correct, and it is BELOW the 124–362 trained range.
**WATCH:** the app prunes nothing; the ComfyUI browser prunes muted nodes. This graph was
authored on the bench, so a node that only ever worked because the browser dropped it will
surface here first.

---

### Steps 4 + 7 — PASS, 2026-08-06

t2v at `very_low` 16:9 (608x352), 5 s requested, cold start 2 m 56 s.

| Claim | Evidence |
|---|---|
| Injection lands everything | All **16** `Input_*` titles populated in the DISPATCHED graph (read off `/queue`): duration, W/H, seed, prompt, both frame strings, both booleans, all six LoRA slots. The silent-skip trap did not fire |
| No graph drift | **64 nodes dispatched = 64 shipped**, none added, none missing — so nothing depended on the ComfyUI browser pruning muted nodes |
| All four branches survive | 133 (t2v), 275 (start), 285 (start+end), 304 (end). Both frame strings empty → correctly took 133 |
| Latent naming trap respected | `Output_Video_Latent` on `MpiSaveLatent` — not a title containing "audio", which `_latentRoleFromTitle` would mis-tag |
| Progress stages | Read **1/2 → 2/2** live. `PROGRESS_STAGES.single = 2` correct |
| Frame grid, in the app this time | `Duration: 00:00:05.17` @ 24 fps = **124 frames** — the predicted `n % 17 == 5` snap from a 5 s request, and the bottom of the 124–362 trained range |
| Video + muxed audio | `Video: h264 (High) 608x352 24 fps` + `Audio: aac (LC) 32000 Hz stereo 128 kb/s`, one sampler pass |
| Gallery (step 7) | User confirmed audio plays in the gallery; nothing re-muxed on save |
| LoRA UI | Six slots render with both Model and Clip strengths, per `MpiLoraModelClip` |

## 5. i2v through the app

- [ ] An i2v run dispatches with a start image and completes.

**This is the one with no op boolean.** Routing derives from media presence:
`Input_Start_Frame` is a path string feeding `MpiAnyChecker` → four lazy `MpiIfElse`
branches. So confirm **media injection actually populates `Input_Start_Frame`** — if it
does not, the graph takes the t2v branch and returns a perfectly good video that ignored
your image.

**PASS:** output frame 0 clearly derives from the source image.
**NOT a concern:** aspect. Closed 2026-08-06 — nodes 218/220 cover-crop both frames to the
canvas first, so the node's plain stretch is a no-op. Do not add app-side fitting.

---

## 6. Preview → Continue — highest risk

The only path that drives the `a6e5d5e` node fix through the app's OWN staging rather than
the throwaway harness the previous session used.

- [ ] Preview run produces a preview card (`Output_Preview`, 1 bar, no `Output_Video`).
- [ ] The app collects the latent from `/history` — this needs the new `ui.latents` payload.
- [ ] **Continue** stages it into engine `input/` under a per-run name and stage 2 loads it.
- [ ] Stage 2 runs **1 bar only** — proof the lazy `enabled` gate skipped stage 1 rather
      than running and discarding it.
- [ ] The finished video replaces or accompanies the preview correctly in the gallery.

**WATCH:** if the app never learns a latent exists, the symptom is Continue doing nothing or
re-running from scratch — that points at `ui.latents` collection, not at the node.

---

### Step 6 — TWO LIVE FINDINGS, 2026-08-06. Step 6 does NOT pass yet.

#### 6a. Preview → Continue was DEAD ON ARRIVAL for H3 — root-caused and FIXED

**Symptom:** every preview toasts *"Preview latent missing — running full workflow to
finish."*, the card gets a **COLD** badge, and the app re-runs the WHOLE workflow. Not a
crash — `COLD` is a designed fallback (`projectService.js`: *"latent missing but
frozenParams + snapshots present"*) — which is why it was easy to miss. **The damage is that
the finished video is a DIFFERENT sample than the preview the user approved**, and
`Projects/H3/Media/.latents/` stays empty (user-confirmed).

**Root cause — `js/services/commandExecutor.js`, `saveLatentNodeIds`:**

```js
workflow[id].class_type === 'SaveLatent' ||
workflow[id]._meta?.title?.toLowerCase() === 'savelatent'
```

H3's node is `class_type: "MpiSaveLatent"` titled `Output_Video_Latent` — it matches
**neither** clause. The set came back EMPTY, so `if (saveLatentNodeIds.has(nodeId))` never
fired, `_collectComfyLatents` was never called, `previewAssets.latent` arrived with no
`filename`, and `_materializeLatent` took its first branch: `status: 'missing'`.

**Why the fleet looked healthy:** all 12 LTX and 4 WAN graphs use core `SaveLatent` and match
clause 1. `minimax_h3_fl2va.json` is the **only** graph using `MpiSaveLatent`, because H3
packs video+audio into one NestedTensor that crashes core SaveLatent. Blast radius: H3 only.

**This was MPI-452's own half-wire.** `a6e5d5e` fixed the NODE half of the two-stage contract
(report `ui.latents`) and the APP half was never swept — precisely the failure the
ROOT-CAUSE RULE's "sweep the blast radius" clause exists to catch.

**Fixed:** added `class_type === 'MpiSaveLatent'`. Pinned by
`tests/save-latent-recognition.test.cjs` (3 tests), which sweeps every shipped workflow for
any class matching `/savelatent/i` and asserts the filter recognises it, mirrors-drift-guards
against the predicate changing, and re-pins H3's "no `audio` in the latent title" trap.
**Negative control run:** under the OLD predicate exactly one node in the whole fleet is
unrecognised — `minimax_h3_fl2va.json` node 171. Suite 462/462.

**Renderer code — Ctrl+R picks it up, no restart needed. NOT yet re-tested in the app;
that is the first job of the next session.** Delete the existing COLD previews first: their
`status: 'missing'` is baked into each item's sidecar at save time, so old cards stay COLD
no matter what the code does now.

**Hypothesis that was WRONG, recorded so it is not re-run:** that a fixed-name save plus
`fs.move` (which does move the engine's only copy out) interacted with ComfyUI's execution
cache so only REPEAT previews failed. The user killed it by changing the prompt
("cats" → "Chihuahuas") — different inputs, no cache, still missing — and then by confirming
the first preview after a fresh restart fails too. The move/fixed-name observation is real
and still worth watching, but it is NOT what caused this.

#### 6b. t2v previews at 5 steps are unusable (product, not a bug)

User: t2v previews are unrecognisable; i2v previews are fine. Both are true and the reason is
structural — the i2v keyframe is a condition latent re-injected every step and never
denoised, so i2v has real composition from step 1, while t2v at 5/20 is 25% denoised from
pure noise.

The split is **one number** in the shipped graph:

| node | class | value |
|---|---|---|
| 140 | `BasicScheduler` | `steps: 20, denoise: 1` |
| 141 | `SplitSigmas` | **`step: 5`** |
| 153 / 156 | `SamplerCustomAdvanced` x2 | the two halves |

It is a true split-sigma continuation, so **total denoising is 20 steps wherever the split
sits** — moving 5 → 8/10 costs preview time and gives exactly that much back on Continue.
The full single-run path is unchanged in total work. The only real loss is on a preview the
user rerolls rather than continues.

Decide: raise the split globally, or make it injectable so t2v splits later than i2v (there
is no op int — routing derives from media presence, so an injectable `Input_Split_Step` plus
app-side logic would be needed). **Regenerate via `generate_h3.py`; never hand-edit the JSON.**

## 7. Gallery: video + audio

- [ ] Gallery plays the clip **with sound**.
- [ ] Nothing tries to mux a second time on save.

H3's audio is muxed INSIDE the mp4 rather than arriving as a separate `audio` output the way
LTX does. That is why `capabilities.audio` is deliberately OFF: the flag surfaces an audio
INPUT slot, and fl2va accepts no audio, it only emits it.

---

## 8. Preview clip for the model card

- [ ] Replace `comfy_workflows/display/minimax_h3_preview.mp4`.

The shipped one is the previous session's 56-frame test render — real H3 output, so not
misrepresentative, but below the trained range. Shoot the replacement at **124+ frames**
(~5.2 s). `low` (864x480) is fine; `very_high` is a final-render tier at ~25 min for 2.33 s.

---

## Things that will look like bugs and are not

- **Installing `minimax-h3-ref2va` later shows NO licence dialog.** Receipts are keyed by
  LICENCE id (`minimax-h3-cla-2026-08-02`), not model id, so accepting here covers both
  variants. Deliberate: the licence binds the person.
- **`getModelRatios('h3')` defaults to `medium` (640x640)** while ratios.js calls `low`
  (864x480) the natural default. The app's default tier is its own concept.
- **A tier A/B is never "same shot, sharper."** A canvas change is a different latent shape,
  so the same seed is a different sample.
- **A Diffusers-format H3 LoRA loads with no error and does nothing** —
  `model_lora_keys_unet` has no H3 branch.
