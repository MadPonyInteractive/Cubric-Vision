# MPI-316 Validation

## Verdict

**Shipped and user-verified in the app (2026-07-20).** One step remains outside
the repo: deleting the two Turbo weights from R2 (user is doing this manually —
an agent attempt was blocked by the irreversible-delete permission classifier).

## User-verified in the app

Generated on the collapsed 2-card layout, local engine:

- **t2i** — correct output, quality restored (the earlier "bad generations" were
  the STALE Jul-19 runtime files, confirmed by the 25-vs-40 step mismatch).
- **i2i** — works.
- **edit** — works.
- **detail** — works.
- **upscale** — initially failed; root cause was a wrong setting, not the
  collapse (Krea2 upscale does not tolerate high cfg). User re-exported the
  upscaler template; the re-export is baked and committed.
- **Turbo toggle** — renders beside the enhancer, persists, hides the negative
  toggle when ON.
- **Dropdown** — reads "Krea 2" / "Krea 2 NSFW" (no stale H tier letter).

## Sampler retune (user, in the ComfyUI graph editor)

The shipping config is NOT the euler-beta@40 the A/B originally landed on — @40
tested badly on realistic styles in the real graph. Final:

| tier | stage 1 | stage 2 (skin pass) |
|---|---|---|
| quality (`Input_Tier` 1) | `euler`/`beta`, 25 steps, cfg 3.5 | `euler`/`beta`, 3 steps, denoise 0.19, cfg 1.0 |
| fast (`Input_Tier` 2) | `euler`/`beta`, 8 steps, cfg 1.0 | *(same)* |

Stage 2 exists because full Raw renders very smooth/plastic skin. Result:
**~130s → ~100s** on quality, better texture, and the NSFW weight can now
produce anime. Both tiers are two-pass, so the progress bar count is
tier-independent (2).

## Agent-verified (automated)

- 2 Krea2 cards remain; every workflow / dep / image reference resolves.
- No orphaned `krea2-turbo-*` id or `krea2_turbo_*` / `_balanced_` / `_high_`
  filename anywhere in `js/`, `tests/`, `scripts/`, `comfy_workflows/`,
  `operation_registry.json`.
- Exactly 6 krea2 runtime files remain (t2i / detailer / upscaler × sfw / nsfw).
- New runtime files carry Raw weights only, `Input_Tier: 1` baked as a safe
  default, and the accelerator LoRA present.
- All 29 workflows pass `validate-injection-rules.mjs`.
- `stagesFor` returns 2 for both tiers; LTX's enhancer delta untouched.
- krea2 test suites: **12/12 pass**, including `output-prompt-capture`, which
  was RED before this session (two stale assertions, both pre-existing).

## Bugs found and fixed en route (not in the original scope)

1. **`krea2Turbo` never persisted** — the control is `scope: 'perModel'` but was
   missing from `_MODEL_WIDE_KEYS`, so every write was silently dropped with a
   warning. Found from a console warning in a user screenshot.
2. **`sync-raw-workflows.mjs` crashed on deleted raw files** — `gitChangedRaw()`
   stripped the XY status code before filtering, so a DELETED template was fed
   to the converter → ENOENT mid-run, after the raw commit had landed. Split the
   list: deletions are committed but never converted.
3. **A text-output workflow was unrepresentable** — the injection validator
   demanded `Output_Image`/`Video`/`Preview`, so `image_descriptor` (which
   captures TEXT on `Output_prompt`) failed the gate and blocked every `--all`
   bake. Any `Output_*` now counts, matching what the reachability check already
   assumed.
4. **Two stale test assertions**, both failing before this card: `stagesFor` was
   keyed on a deleted workflow, `'LTX_t2v.json'` was capitalised (lookups are
   verbatim → returned 0), and the style-label count was hardcoded to 10 after
   the rack grew to 11.

## Open — NOT done

- **R2: delete the 2 Turbo weights.** Pre-approved, sequenced last, and safe to
  run (nothing in the repo references them). The agent's `rclone deletefile` was
  blocked by the irreversible-delete permission classifier; the user is doing it
  manually. Objects:
  - `vision/models/diffusion_models/krea2_turbo_fp8_scaled.safetensors` (13141730784 B)
  - `vision/models/diffusion_models/lustify-v10-krea-turbo-int8_convrot.safetensors` (13148974712 B)

  Verified before recommending deletion: the two NSFW weights share an identical
  byte count (13148974712) but have DIFFERENT recorded SHA256s (`0505412e…`
  turbo vs `f165d4db…` raw) — distinct files, same arch/quant. Not a mis-upload.

- **Card art** — both cards still reference `krea2-turbo-*.webp`. Filenames are
  now misleading; user decided the images are close enough and small, so they
  stay. Deliberate, not an oversight.

## Done in passing

Aborted an orphaned R2 multipart upload for
`vision/models/loras/qwen/styles/Illustration_style.safetensors` (initiated
2026-07-18 04:40Z, never completed). The real 590 MB object had completed at
02:21Z and is untouched — verified present after cleanup. Bucket now reports
zero pending multipart uploads.
