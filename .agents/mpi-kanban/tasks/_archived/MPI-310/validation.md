# MPI-310 — Validation

Code complete, **nothing verified in-app**. Everything below is unrun.
Five commits: `33b09b3e`, `1eaa4031`, `a9bf054c`, `5c7f6d2e`, `1fe8461a` (branch `1.2.0`).

## Before you start

**The renderer holds stale JS.** The app was running on :3000 throughout the build
session, so none of these changes are live in it. `MpiPromptBox`, the two context
menus, `MpiModelManager` and the CSS are all renderer-side — a reload (Ctrl+R) picks
them up. `routes/downloadManager.js` is main-process and needs a full restart
(memory `tool_main_process_no_hot_reload`).

Safest: full app restart, not a reload.

The weight is already on disk at
`G:/CubricModels/text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors`
(5242481504 bytes), so the Plugins row should read **Installed** immediately — it
is NOT going to re-download on first look. Confirmed against the live server:

```
POST /comfy/models/check {"models":[{"id":"plugin:image-describer","deps":[...]}]}
→ {"plugin:image-describer":{"installed":true,...}}
```

## Checks

### 1. Plugins row renders — Model Library
Open the Model Library. Below Installed/Available there must be a **PLUGINS 1**
section with one row: `Image Describer · 5.24GB · ✓ Installed [Uninstall]`.

- Must NOT appear inside the IMAGE or VIDEO sub-grids.
- Must NOT change the "N installed · N available" count line.
- Toggling the MEDIA or SIZE filters must not hide it.
- Searching "describe" must show the row even though no MODEL matches
  (the empty-state early-return was patched for exactly this).

### 2. Describe from a gallery card
Right-click a gallery card with an image → **Describe image**.

Expect: a queue card appears, status bar reads **Describing**, and on completion
the caption lands in the prompt box positive field + a success toast.

- No history item and no new gallery card should be created (a text op produces none).
- The right-click entry must be greyed for a multi-select and for video cards.
- Progress may show no `/M` denominator — expected, a text workflow emits no tqdm bars.
- Warm run was ~18s in the MPI-308 harness.

### 3. Describe from a history item
Same, right-clicking an entry in the history list. Caption goes to the same place.

- The entry must be **absent** (not greyed) on a video group.

### 4. Negative-mode check — the subtle one
Toggle the prompt box to **negative** mode, then run Describe.

**Expect:** the box flips back to positive and shows the caption.

Before the fix, `injectPrompts` stored the positive but left the negative on screen —
the caption vanished from view and, being written to the draft, would resurface later
out of nowhere. Verified by unit-checking the predicate across 10 cases (including
empty-string positives), but never run in the real UI.

Also confirm the negative toggle BUTTON flips to match, and that Reuse Prompt (which
injects both sides at once) still keeps whatever mode you were in.

### 5. Uninstall — DO THIS LAST
From the Plugins row → **Uninstall** → confirm.

**Expect:** 5.24GB actually freed; the row flips to `Install (5.24GB)`.

Do it last: re-installing is a 5GB download from R2.

This is the case that regressed during the build. The first version of the GC guard
protected plugin deps unconditionally, which made Uninstall a silent no-op — the
button appeared to work and freed nothing. Fixed by honouring the uninstall
exclusion; mutation-tested (`tests/plugin-dep-gc.test.cjs` goes red when the
exclusion is removed).

**Also verify the inverse** (cheaper, do it before #5): uninstall an unrelated
model (e.g. any installed model in the Library) and confirm the Image Describer
row STILL reads Installed. That is the original bug the plugin entity exists to
prevent — a dep owned by neither a model nor an app being swept away.

## Unit checks that already pass

```bash
node tests/plugin-dep-gc.test.cjs        # GC: unrelated-uninstall protects, self-uninstall releases
node tests/text-op-completion.test.cjs   # outputKind contract + 28 ops in sync across both registries
```

## Known gaps / out of scope

- **Video "Describe current frame" NOT built** (card step 5). The loader node reads an
  OS path, not a blob, so a captured frame must be written to disk first. `describeItem`
  refuses video with a toast. Related: MPI-287 (frame-accurate capture via frameSink).
- **RunPod / remote engine — VERIFIED PASS (2026-07-21, MPI-324 sweep, RTX PRO 4000
  Pod, volume cubric-vision-EU-RO-1).** See "## Remote validation" below. The weight is
  NOT baked into the Pod image (deliberate — 5.24GB optional captioner); it fetched /
  was staged on the volume and the describer ran.
- **`runImageDescribe()` in `js/services/commandExecutor.js` is now dead code.** The dev
  harness that called it was retired. Left in place deliberately (pre-existing public
  export), flagged for an intentional sweep.
- **Caption is not persisted.** It goes to the prompt box only — no sidecar storage, no
  auto-feed to upscale. Deliberately out of scope per the card.

## Remote validation — PASS (RTX PRO 4000 Pod, MPI-324 sweep, 2026-07-21)

Full shared-dep guard lifecycle + describe, all remote, all green:

1. **Inverse-GC — PASS.** Uninstalled Krea 2 (a HOLDER of the shared abliterated
   encoder, not merely an unrelated model) -> Image Describer stayed Installed and the
   5.24GB encoder was retained. The remote twin guard (_remoteSharedDepIds
   exclusive-evidence fix) held at the 2-holders -> 1-holder transition. Krea cards
   showed a partial (21 percent) bar = exclusive files gone, shared encoder kept =
   correct.
2. **Describe from a gallery card — PASS.** Toast "Description added to the prompt";
   caption landed in the prompt-box positive. The shared encoder that survived the Krea
   uninstall actually RAN (strongest proof it was not swept).
3. **Describe from a history item — PASS.** Full detailed caption landed in positive.
4. **Negative-mode flip — PASS.** With negative mode on, Describe flipped the box back
   to positive, pasted the caption, left negative empty; toggle matched.
5. **Uninstall (DEAD LAST) — PASS.** Describer was now the ONLY holder of the encoder
   (Krea already gone) = the 1-holder -> 0-holder transition. Uninstall freed 5.24GB
   (storage 104.2GB -> 99GB) and, after the Model-Library refresh, the row flipped to
   `Install (5.24GB)`. This is the case that regressed mid-build (GC guard made uninstall
   a silent no-op) — now correct on remote.

Net: the destructive shared-dep bug (data loss, 2026-07-19) is fixed AND remote-verified
end to end; both engine twins proven. Describe feature works on the remote engine.

Residuals (NOT this card): video "Describe current frame" = MPI-287; plugin-row
concurrent-install display race (download-mode only, non-blocking) = MPI-320.
