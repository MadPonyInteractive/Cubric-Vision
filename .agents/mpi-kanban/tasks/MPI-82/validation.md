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

## Phase 2/3 — remote upload + live-Pod verification — PENDING
Gated on the MPI-81 Pod-image rebuild (new `/wrapper/models/upload` endpoint).
Card kept in `doing` / `validating`; remote validation to be done alongside MPI-64
(RunPod remote engine) progress. See plan.md Phase 2/3 + checklist.

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
