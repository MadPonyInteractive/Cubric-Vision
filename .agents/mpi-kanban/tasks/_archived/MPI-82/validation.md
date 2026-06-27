# MPI-82 Validation

## Phase 1 — local drag-drop + missing guard — ACCEPTED (USER, 2026-06-14)
- Drag-drop LoRA + upscale into configured folder zones (Settings + picker) → file
  copies, list refreshes, model selectable. ✓
- Same-name drop → confirm-replace dialog. ✓
- Remove a folder → referenced model flags red `(missing)`; LoRA blocks generation
  with toast; upscale warns + falls back to SIAX. ✓
- Subfolder LoRA on Windows generates (separator fix). ✓
- Relocated model (subfolder removed, same file at root) heals — not red, loads;
  ambiguous same-name across folders stays red (heal logic verified offline 7/7;
  user skipped the live ambiguous case). ✓
- Regressions fixed + reverified: stuck gallery overlay, PromptBox TDZ, duplicate
  drop zones. ✓

## Phase 2A — app spine — SHIPPED (commit d8925a1)
On-demand model auto-upload: presence-check (`/remote/model-present` →
`/wrapper/models/status`) then upload-if-absent (`/remote/upload/model` →
`/wrapper/models/upload`), gated `isRemote() && !forceLocal`, with an "Uploading…"
toast. No param rewrite (Pod resolves by basename). Self-check + lint green.

## Phase 2B — wrapper endpoint + image — SHIPPED (mpi-ci 249ea37, image v0.4.9 / wrapper 0.2.11)
`POST /wrapper/models/upload` lands at `MODELS_DIR/<type>/<basename>`. App gate
flipped to v0.4.9 / 0.2.11 (commit 553a1b9). `/wrapper/models/status` untouched.

## Phase 3 — live-Pod verification — ACCEPTED (USER, 2026-06-17)
Tested on a live L4 Pod (image v0.4.9 / wrapper 0.2.11) after app restart.
- [x] **(1) Auto-upload happy path.** Remote `t2v_ms` gen with a Pod-absent local LoRA
      → "Uploading "<name>" to the cloud…" toast with the correct LoRA name → upload
      landed on the volume (volume usage climbed, ~400MB LoRA) → generation ran → the
      LoRA visibly influenced the output. ✓
- [x] **(2) The opening repro.** Remote upscale with the custom local upscaler
      `1xDeNoise_realplksr_otf.pth` (Pod-absent) + a second upscaler
      `1x-ITF-SkinDiffDetail-Lite-v1.pth` → "Uploading…" toast (correct name + bucket)
      → both PRODUCED OUTPUT (imageUpscale_003/004). The silent "completed but no
      output" bug is FIXED. ✓ (Both buckets — loras + upscale_models — confirmed.)
- [x] **(3) Skip re-upload.** Re-gen / concurrent gens with the same model → presence
      check returns true → NO second upload toast, instant dispatch. ✓
- [N/A] **(4) Pod-reset re-upload.** Not testable: the RunPod network volume is
      PERSISTENT — a Pod "Reset" resets the container/ephemeral disk (Uptime kept
      climbing, volume stayed 90% full), NOT the network volume. The only way to clear
      `/workspace/mpi_models/` is a manual file delete or destroying the volume (wipes
      ALL models — not worth it). Moot anyway: the presence check is a LIVE
      `os.path.exists` on the volume every gen (no app-side cache to go stale), so the
      absent→upload direction is already proven by (1)/(2) and the present→skip
      direction by (3). A file once on the durable volume stays found.
- [ ] **(5) True local-missing still blocks.** Phase-1 behavior (unchanged by 2A);
      not re-run live — the local guard (`_findMissingModel`) was untouched and
      verified in Phase 1. Low risk.

### Verdict
Core contract proven end-to-end on a real Pod: absent local model → toast + upload →
output; present model → skip; both LoRA and upscale buckets; the original repro model
produces output instead of dying silently. MPI-82 ACCEPTED.

### Separate observation (NOT MPI-82 — flag for its own card if real)
An x2 upscale appeared to DOWNSCALE (832×1024 source → 416×512 outputs in the gallery).
This is an upscale-factor / output-sizing concern in the upscale workflow, independent
of model upload — the upload + generation path worked (it produced output with the
correct model). Do not attribute to this card; investigate separately if reproducible.

### Legacy note — the failure this card predicted (pre-fix, 2026-06-17)
Trimmed-video upscale (`video_crop_001`) with custom local `1xDeNoise_realplksr_otf.pth`
on an L4 Pod → `generationService` logged "Generation completed but no output
returned", SILENTLY. Switching to Pod-baked `4x_NMKD-Siax_200k.pth` → ran clean.
Root cause: `/comfy/list-files` enumerates local disk regardless of remote state, so
local-only models appear in the dropdown remotely; the Pod then can't find them. The
Phase 2A/2B auto-upload is the fix; step (2) above re-runs this exact case to confirm.

## 2026-06-17 — live-Pod repro (the symptom this card predicted)
Connected to an L4 Pod. Ran a trimmed-video upscale (`video_crop_001`) with a
**custom local** upscaler `1xDeNoise_realplksr_otf.pth` — present in a user
extra-folder, NOT baked on the Pod.
- Result: `generationService` logged "Generation completed but no output returned",
  **silently** — no toast, no error dialog. Run died mute.
- Switching to the engine-default `4x_NMKD-Siax_200k.pth` (Pod-present) → upscale ran
  clean and produced output.
This is the exact failure the brief's Investigation Verdict predicted: `GET
/comfy/list-files` (`routes/comfy.js:602`) enumerates **local disk** regardless of
remote state — only the path separator is remote-aware (`:640-642`). So local-only
upscale/LoRA models still appear in the dropdown when remote-connected; pick one and
the Pod fails "model not found" with no warning.

### Implication for Phase 1 scope
Phase 1's guard was scoped as *local-missing* ("model not in any pointed-at folder").
This failure is **remote-specific**: the model IS in a local folder, just absent on
the Pod. The guard needs a **remote-aware** branch — in remote mode, a local-only
(non-Pod) model must count as missing → red dropdown item + blocking toast on
Generate. Confirm the existing upscale fallback-to-SIAX path also fires remotely.
