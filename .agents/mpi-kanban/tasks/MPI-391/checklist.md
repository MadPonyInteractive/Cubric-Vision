# MPI-391 Checklist — 1.3.0 cross-platform validation sweep

Tick as verified. Each item names the card that OWNS the result — write the
evidence into that card's `validation.md`, not here. Detail for every line is in
`brief.md`.

## Machine order (set by the user 2026-07-30)

**A (build cut) → A2 this dev PC → B Windows laptop → D Linux laptop → C rented Mac.**

The Mac is LAST on purpose: it is the only machine that bills by the hour, so it
is rented once everything cheaper has already passed. Sections keep their
original letters so existing references still resolve — only the running order
changed.

**This dev PC cannot stand in for the laptop.** `where git` resolves here
(`C:\Program Files\Git\cmd\git.exe`), so MPI-387 fix B is unprovable on this box
by construction, and Smart App Control is not the blocking configuration here
either. What this box CAN settle is section A2 below.

## A2 · This dev PC — Windows, first machine

- [x] Fresh extract of the real `CubricVision-windows-x64-v1.3.0.zip` via Explorer "Extract All" — *MPI-387 A (partial: no SAC, no missing-git)* ← 6419 files in zip = 6419 on disk, ONE folder, `CubricVision.exe` at its root, `resources/app/package.json` reads 1.3.0. Longest path 176 chars = 84 under MAX_PATH. Evidence: `tasks/MPI-387/validation.md` § dev PC
- [x] `CubricVision.exe` launches from that extract — *MPI-387 D (partial)* ← full first-run chain clean: splash → models-folder picker → 18+ gate → What's New v1.3.0 → home at `V1.3.0`. `app.log` has no errors and logs `up to date (current=1.3.0 latest=1.2.0)`, which is the pre-publish constraint seen live. **No SmartScreen on this box** — the SAC question was not asked here, section B still owns it. Evidence: `tasks/MPI-387/validation.md` § D launch half
- [x] Generate smoke — *release sanity* ← **done REMOTE, not local.** KREA 2 t2i, 1344×768, 21s, on a fresh Pod (`bh1x2asru9nv1y`, RTX PRO 4000, image `v0.17.0-cu130`) from the packaged 1.3.0 extract. `hot-store: 16/16 file(s) on Pod disk`, no errors in `app.log`. **The LOCAL-engine smoke is still unproven on Windows** — this box took MPI-390's skip-install, so section B's "engine install completes" item is the only place it gets exercised. Bench was never a risk: 8188 free all session
- [x] Real v1.2.0 install updated to 1.3.0: files copied, `start.vbs` gone, stale `app/` left behind — *MPI-387 D transition* ← **PASSED via `update-from-zip.bat`** (the applier half; fetch+spawn is the separate post-publish item below). `resources/app/package.json` now 1.3.0, `start.vbs` absent, stale `app/` still reading 1.2.0 exactly as designed, `CubricVision.exe` at root, rollback dir written. Evidence: `tasks/MPI-387/validation.md` § D transition half
- [ ] Same run: in-app update prompt's real fetch + spawn worked — *MPI-334* (first live test ever) ← needs the GitHub Release to exist, so this one item runs AFTER publish

## A · At the build cut (blocks everything below)

Done 2026-07-30 except the promote. Evidence: `tasks/MPI-369/validation.md`
§ VERIFIED at the 1.3.0 cut. CI run `30559394491`, artifacts in
`D:\CubricStudio\Vision\Builds\v1.3.0\`, all six integrity-tested.

- [x] **`publish-runtime.sh promote` run — dev wrapper bytes → stable** — *release / mpi-release pre-flight* ← run by the user 2026-07-30 from `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`, closing the dev `0.2.40` vs stable `0.2.38` drift. **Proven from the shipping artifact, not just asserted:** the packaged 1.3.0 extract then created a Pod with NO `dev_mode: Pod boots the dev R2 runtime channel` line in `app.log` — that line only fires when `_devMode` is true ([remotePodLifecycle.js:672](../../../../routes/remotePodLifecycle.js#L672)), so its absence is the released build taking `stable`, and the generation that followed ran on the promoted bytes
- [x] 1.3.0 artifacts built for win32-x64, linux-x64, macos-arm64 — *release*
- [x] Windows update bundle root reads `CubricVision-v1.3.0-update-only` — *MPI-369* (all three bundles, not just Windows)
- [x] Update asset name is exactly `CubricVision-windows-x64-update-v1.3.0.zip` (FROZEN — shipped updaters glob it) — *MPI-369*
- [x] 1.3.0 update manifest reads `from 1.2.0`, not `null` — *MPI-369* (all three; Linux 209 / macOS 208 file real deltas prove the restamp reached CI)
- [x] File counts sane vs baseline 6362 win32 / 6505 darwin / 6325 linux — *MPI-369* (6418 / 6563 / 6383 — +56/+58/+58)
- [x] `release-baselines/win32-x64.json` restamped from the shipped FULL manifest — *MPI-387 lineage* (all three restamped, `36f972cf`)

## B · Windows — Smart App Control laptop

- [x] `where git` finds nothing (precondition, else fix B proves nothing) — *MPI-387 B* ← `INFO: Could not find files for the given pattern(s)`. Precondition HOLDS, so the engine install below is a real git-less run
- [x] **Smart App Control is genuinely ON** (precondition, else the launch below is vacuous) — *MPI-387 D* ← `VerifiedAndReputablePolicyState = 0x1` (enforced; 0 = off, 2 = evaluation). Plus MOTW verified on the EXTRACTED exe, not just the zip: `CubricVision.exe:Zone.Identifier:$DATA` 99 bytes. Zip arrived byte-exact from Drive at 523,638,376
- [x] Explorer "Extract All" into default Downloads → ONE folder, `CubricVision.exe` directly inside — *MPI-387 A* ← `C:\Users\hugom\Downloads\CubricVision-windows-x64-v1.3.0\`, exe at its root
- [x] `CubricVision.exe` launches (NOT a silent block) — *MPI-387 D* ← **THE RESULT OF THE DAY. PASSED.** Double-click went straight into the app on enforced SAC with an unsigned, MOTW-carrying binary: no block, no SmartScreen dialog, no Run-anyway step. The silent-block failure this card was raised for did not occur on the machine that produced it. Evidence: `tasks/MPI-387/validation.md` § SAC laptop
- [x] Engine install completes; no `Cannot find command git` — *MPI-387 B* ← **PASSED, and the fix was SEEN FIRING:** `requirements filtered for ComfyUI-Impact-Pack on win32: dropped git+.../sam2`. ComfyUI v0.28.0 portable + all 15 universal nodes installed. Zero `Cannot find command git`
- [x] No MAX_PATH / Long-Path HINT from LTXVideo pip — *MPI-387 A* ← none. Ran from a real deep path under `engine\ComfyUI_windows_portable\ComfyUI\custom_nodes\`. **Fix A is now closed end to end** (archive half on the dev PC)
- [x] No `Illegal transition ComfyUI-Frame-Interpolation: complete -> downloading` — *MPI-387 F1* ← absent; the node downloaded and installed normally
- [x] The no-GPU fallthrough WARN appears (presence = fix working) — *MPI-387 F2* ← present, and the precondition is genuine (`nvidia-smi not found or failed`). This laptop really has no GPU, so the branch was not simulated
- [x] `cupy-wheel` build failure followed by "succeeded" seen and IGNORED as expected — *MPI-387 F3* ← exactly as documented. Fails on `ModuleNotFoundError: No module named 'pkg_resources'`, node then prints "Installing cupy...", install completes anyway
- [ ] Any real failure names the node + real phase, never "extraction failed" — *MPI-387 C* ← **NOT EXERCISED and deliberately not ticked.** The install completed with no fatal failure, so nothing ever needed attributing. A clean run cannot prove this
- [x] `app.log` captured from `<extract root>/user-data/logs/` — *MPI-387 evidence* ← read and filtered; findings written into `tasks/MPI-387/validation.md` § git-less clean install
- [ ] ~~Generate smoke on the laptop~~ — **deliberately NOT run.** No GPU means ComfyUI launches `--cpu` ([comfy.js:370](../../../../routes/comfy.js#L370)), so a modern model would take minutes-to-tens-of-minutes per image and prove nothing. Smoke is covered remote on the dev PC and stays local-owned by section D (Linux)
- [ ] Real v1.2.0 install updated in-app to 1.3.0: files copied, `start.vbs` gone, stale `app/` left behind — *MPI-387 D transition* ← **POST-PUBLISH** (see below)
- [ ] Same run: in-app update prompt's real fetch + spawn worked — *MPI-334* (first live test ever) ← **POST-PUBLISH** (see below)

> **The in-app update items CANNOT run before `gh release create`.** The check
> hits `https://api.github.com/repos/MadPonyInteractive/Cubric-Vision/releases/latest`
> ([main.js:1023](../../../../main.js#L1023), and `scripts/portable/fetch-release.cjs`
> for the `update.bat` path), so until 1.3.0 is a published non-prerelease
> release, a 1.2.0 install correctly sees 1.2.0 as latest and offers nothing.
> Found 2026-07-30 while sequencing the machine order.
>
> **What CAN be proven pre-publish:** `update-from-zip.bat` takes a LOCAL bundle,
> so it exercises the applier half — files copied, `start.vbs` gone, stale `app/`
> left behind — without the fetch+spawn half. Run that on this dev PC against
> `D:\CubricStudio\Vision\Builds\v1.3.0\CubricVision-windows-x64-update-v1.3.0.zip`.
> The fetch+spawn half is the only genuinely post-publish item on this card.

## C · macOS — rented Mac

> **READY TO RUN 2026-07-31.** Build the Mac tests against: CI run `30602683182`,
> source ref `bd8a0cc6` — cut deliberately because the previous artifacts
> (`81a8d684`) predate the engine-startup error-reporting fix and the plugin
> shared-library `--upgrade` removal, both of which sit on the exact install →
> launch path this section exercises. **Artifact retention is 1 day from the run**,
> so the artifacts were pulled to `D:\CubricStudio\Vision\Builds\v1.3.0\`
> immediately; the superseded set moved to `SUPERSEDED-pre-MPI-415/`.
>
> **Model to install: SDXL Realistic.** It is `sizeTier: low` AND depth-capable
> ([models.js:43](../../../../js/data/modelConstants/models.js#L43) `poseReference`),
> and its dependency list carries `comfyui_controlnet_aux`
> ([models.js:60](../../../../js/data/modelConstants/models.js#L60)) — so ONE
> install of the cheapest model exercises the macOS fix and then serves the
> generate smoke. Image models install their whole dep set, so no per-op toggling
> is needed to pull the node.
>
> **The two log lines to grep for** (`<extract root>/user-data/logs/app.log`, and
> `app.log.1` — pip output rotates it):
> ```
> requirements filtered for comfyui_controlnet_aux on darwin: dropped onnxruntime-gpu
> requirements filtered for ComfyUI-Impact-Pack on darwin: dropped git+https://github.com/facebookresearch/sam2
> ```
> The first is MPI-370's fix. The second is MPI-387's git-less drop, which is
> configured for darwin too ([nodesDeps.js:88-92](../../../../js/data/modelConstants/nodesDeps.js#L88-L92))
> and has only ever been seen fire on win32 — free evidence while the Mac is up.
>
> **Fresh run, nothing reused** (user's instruction): fresh extract of the new
> `CubricVision-macos-arm64-v1.3.0.zip`, engine installed from scratch.
>
> **The payload was verified INSIDE the shipped mac zip, not just in the source
> tree** — a rebuild is only worth cutting if the fixes actually reached it:
> - `_describeComfyExit` present in `app/js/services/comfyController.js`, and the
>   fix is wired END TO END, not half-wired: `routes/comfy.js:415-432` writes
>   `lastComfyExit` on child exit (with the `deliberate` flag so a user Stop is not
>   reported as a crash), `:185-194` returns it as `lastExit` on `/comfy/status`,
>   and the controller consumes it. Both halves in one artifact.
> - `--upgrade` is GONE from the node-requirements install in
>   `app/routes/downloadManager.js` (0 matches for the old form, 1 for the new).
> - `requirementsDrop: { darwin: ['onnxruntime-gpu'] }` still configured — the
>   thing under test survived the rebuild.
> - `app/package.json` reads `1.3.0`; ONE top-level folder; 6834 file entries,
>   **byte-for-byte the same count as the previous build**, so the source delta
>   added no files. (Note: 6834 counted from the zip ≠ the 6563 recorded in § A,
>   which came from the build MANIFEST — different denominators, not a
>   regression. The previous build counts 6834 the same way.)
> - `release-baselines/*.json` confirmed still at `toVersion: "1.2.0"` (restored by
>   `addc03a2` after `36f972cf` restamped too early), so the update bundles carry
>   real 1.2.0→1.3.0 deltas. The mac update bundle root reads
>   `CubricVision-v1.3.0-update-only` and is 3.3 MB of real content.

- [x] `xattr -dr com.apple.quarantine "<folder>"` → `start.command` launches — *MPI-370* ← **PASSED with the blocking condition manufactured first.** scp does not quarantine, so `xattr -w com.apple.quarantine` (Safari-style value) was written by hand before extracting or the test would have been vacuous. Archive Utility propagated it to 6564 files, Gatekeeper genuinely blocked `start.command` with the Move-to-Trash dialog, the documented command cleared 6564 → 0, and the app launched with ZERO manual repair. Evidence: `tasks/MPI-370/validation.md`
- [x] A **DEPTH** model installs without the Installation-failed error — *MPI-370* ← **PASSED 2026-07-31T08:33Z.** SDXL Realistic installed from the Model Library on the M4: 9.0 GB, both deps complete, peak 104 MB/s, **zero ERROR or WARN in `app.log`** and no Installation-failed dialog. On disk: `SDXL_Realistic.safetensors` 7,105,352,784 and — the depth half that makes this item the depth item — `controlnet/ControlNet-Union-ProMax-SDXL.safetensors` 2,513,342,408. `comfyui_controlnet_aux` was already extracted, so the install took the "skipping extraction but verifying requirements" path and its custom command + pip pins succeeded a second time
- [x] The `requirementsDrop` log line is PRESENT (absence = the field vanished through `_createDepJob`'s whitelist) — *MPI-370* ← **PRESENT, 2026-07-31T08:21:29Z:** `requirements filtered for comfyui_controlnet_aux on darwin: dropped onnxruntime-gpu`. **Bonus, first time ever on darwin:** `requirements filtered for ComfyUI-Impact-Pack on darwin: dropped git+.../sam2` (MPI-387's git-less drop — configured for darwin but only ever seen fire on win32 until now). Both fired during the ENGINE install because both are UNIVERSAL nodes, so the planned model install was not needed for this proof. Evidence: `tasks/MPI-370/validation.md`
- [x] Plain install → launch → generate smoke passes — *MPI-370 + MPI-249* (macOS generation has never been validated) ← **PASSED 2026-07-31T08:45Z, first generation on Apple hardware in any release.** ComfyUI booted on Metal (`Device: mps`, `vram state: SHARED`, torch `2.14.0.dev20260730`), SDXL Realistic t2i 832×1024, `Prompt executed in 77.18 seconds`, image in the gallery. **Bonus: SAM3 open-vocabulary text masking also passed** — "eyes" → `# of Detected SEGS: 2` in 16.63s, both eyes correctly masked. Evidence: `tasks/MPI-370/validation.md`
- [ ] **TWO DEFECTS FOUND AT FIRST BOOT — see `tasks/MPI-370/validation.md` § TWO NEW DEFECTS.** (a) the uv engine installs an **unpinned** ComfyUI (**0.29.0** landed) but stamps it `0.28.0`, so `version-check` can never detect the drift — and our pinned LTXVideo node **fails to import** on 0.29.0, killing LTX video on macOS AND Linux local engines. Windows unaffected (prebuilt-archive path is genuinely pinned). (b) TAESD previews are enabled in two places but the decoder weights are in no dependency table, so there is no live preview during sampling. **Neither is carded yet — user decision pending**
- [ ] Extracted from the real `CubricVision-macos-arm64-v1.3.0.zip`, LOCAL engine provisioned via the uv/comfy-cli path, 11 UW nodes installed, one model per family generated — *MPI-249* (macOS half; MPI-249 closes only when Linux AND macOS are both done, so expect it to stay open if either slips)

## D · Linux — separate machine

**Machine: ThinkPad X121e, Ubuntu 22.04, 4 threads, 7.7 GB RAM, NO NVIDIA driver
→ the app provisions `--cpu` ([engine.js:366](../../../../routes/engine.js#L366)).
It thermally shut down mid-install once.** Consequence for this section:
**MPI-198 IS provable here** (`value_not_in_list` is raised at `/prompt`
validation, before any weight loads — a `200` + prompt_id is the proof, and the
generation may then fail on execution without affecting the claim).
**MPI-249's Linux half is NOT** — it needs a completed generation, which this
box cannot deliver. MPI-249 stays open for a GPU Linux machine.

- [x] Extract integrity — *MPI-387 A, Linux half* ← `tar.gz` **502967733 bytes**, byte-exact. ONE top-level folder. **6384 files** on disk (+1 over the manifest's 6383, matching Windows' +1: 6418 recorded, 6419 actual). `uv/uv` (55 MB) and `app/node_modules/electron/dist/electron` (206 MB) both kept their exec bits — the `[ -x "$ROOT/uv/uv" ]` gate at [start-with-terminal.sh:11](../../../../scripts/portable/linux/start-with-terminal.sh#L11) would otherwise silently skip `CUBRIC_UV_BIN`. Layout `app/` + `resources/` + `uv/` is CORRECT for Linux ([build-portable.mjs:39-65](../../../../scripts/build-portable.mjs#L39-L65): `resources/app` is win32-only)
- [x] **FIVE BUGS FOUND — all pre-existing, none ever seen before.** MPI-406 (`--cpu` pulled the whole CUDA 13 stack), MPI-407 (slow start → permanently black window), MPI-408 (Retry after a failed install can NEVER succeed), then MPI-411 and MPI-413/MPI-414 found while verifying those. **Live-verified 2026-07-30/31:** MPI-407 (cold-cache repro, server bound 13.5s, fallback fired, retry 9 landed), MPI-408 (`uv venv --clear` rebuilt an existing venv), MPI-411 (controlled before/after — `exit 1` unfixed vs `--restore` + install proceeding, only `engine.js` differing). **MPI-406 is PARTIAL and stays open** — its own stage is now positively proven (`torch-2.13.0+cpu` off the PyTorch CPU index, no `nvidia-*`/`triton` at that stage), but the custom-node stage still overwrites it → **MPI-413**. Evidence in each card's `validation.md`
- [x] Loader-path heal reproduced: LOCAL engine + **subfoldered** LoRA — *MPI-198* ← **LIVE-VERIFIED 2026-07-31T02:40:07Z.** Wan 2.2 5B t2v on the local `--cpu` engine: template bakes `wan-2.2-5b\Wan22_…`, ComfyUI **received** `wan-2.2-5b/Wan22_…` (read from the server's own `/history`, prompt_id `d9ad18a3`). `got prompt` = validation passed; execution then died at `VAELoader` on a zero-byte placeholder in 0.09s, which is after validation and by design. `_serverPlatform` read `linux` → the new line-93 branch fired. Placeholders deleted, 0 remaining. **Caveat: the box needed a test-box-only `kornia_rs==0.1.9` pin to boot ComfyUI at all — MPI-415.** Evidence: `tasks/MPI-198/validation.md`. (see its `plan.md` / `checklist.md`). **NOTE: `plan.md:24`'s precondition is stricter than reality** — it asks for a hand-installed sub-subfoldered LoRA, but the shipped templates already bake backslashed subfolder values everywhere (`krea2_t2i_*.json:1197` `krea-2\extra\…`, `:1296-1317` `lora_1..5` `krea-2\style\…`, `ltx_i2v*.json:1222` 3 levels, `klein_t2i.json:542`, `wan5b_t2v.json:120`). Any default Krea 2 t2i on the Linux local engine is enough. **SDXL and the masking graph canNOT prove it** — every path value there is separator-free or forward-slash-only
- [ ] Plain install → launch → generate smoke passes — *MPI-198 + MPI-249* (Linux generation has never been validated) ← **NOT PROVABLE ON THIS BOX and deliberately not ticked.** MPI-198's half is closed by the item above, which needs only `/prompt` validation. A *completed* generation needs real weights and a CPU that can finish one; this machine is a 2011 i3-2367M that thermally shuts down under load. **MPI-249's Linux half stays open for a GPU Linux machine.** Separately, MPI-415 means the stock engine cannot even boot ComfyUI here
- [ ] Extracted from the real `CubricVision-linux-x64-v1.3.0.tar.gz`, LOCAL engine provisioned via the uv/comfy-cli path (`routes/engine.js _provisionUvEngine`, NOT the Windows prebuilt-archive path), 11 UW nodes installed, one model per family generated — *MPI-249* (Linux half)

## E · Opportunistic

- [ ] If a download stalls during any install above, note whether it self-heals — *MPI-291* (never seen fire; do not force it)

## Close-out

- [ ] Every result written into its OWNING card's `validation.md`
- [ ] Each owning card moved
- [ ] Deferred items recorded with a reason (see `brief.md` § E)

## Update 2026-08-01 — the Windows leg completed, and the macOS leg FAILED then was fixed

### Windows (section A2) — the local-engine gap above is now CLOSED

A2 recorded `The LOCAL-engine smoke is still unproven on Windows` because that box
took MPI-390 skip-install and the smoke ran remote on a Pod. It has now run locally,
end to end on the real shipped zip (build #4, `3cb4a58d`): clean extract launched from
Explorer, engine exists:false first run, RTX 4060 Ti CUDA 13.2 detected, LOCAL engine
installed and stamped ComfyUI 0.29.2, SDXL Realistic 7/7 deps at 39.3 MB/s, and
`Prompt executed in 12.62 seconds` with the image written to the project Media folder.
Windows is the first platform validated install-to-image on a shipped 1.3.0 artifact.

Bonus, unplanned: that COLD first boot actually fired the 5s server-wait timeout
(server took 6.4s) and logged `[WARN] [main] Server signal timed out` — the
black-window bug diagnostic, visible only because of the MPI-418 logging sweep. The app
recovered correctly and a warm relaunch was 400ms.

### macOS (section C) — the generation box above passed ON LUCK, not on correctness

Section C ticks `Plain install -> launch -> generate smoke passes` and records the
engine as `torch 2.14.0.dev20260730`. That detail turned out to be the whole story.
macOS was installing an UNPINNED PyTorch NIGHTLY (comfy-cli hardcodes `--pre` +
the nightly index for `--m-series` only), so which engine a Mac user got depended on
the day they installed. dev20260730 happened to be good.

On build #4 the same leg produced a 1.8MB PNG of uniform grey noise after a normal
`Prompt executed in 73.22 seconds`, with no error anywhere. Isolated to torch with
ComfyUI held at 0.29.2: nightly dev20260731 = noise, dev20260730 = correct, stable
2.13.0 = correct. Fixed in `baefe4c3` (pin stable torch on darwin +
`--skip-torch-or-directml`), rebuilt as build #5 (`30674488835`). Full evidence:
`tasks/MPI-419/validation.md` § REOPENED 2026-08-01.

- [x] Windows local-engine install + generation on the shipped artifact — closes the A2 gap
- [x] macOS grey-noise defect found, root-caused to unpinned nightly torch, and fixed
- [x] macOS re-validated on the REAL build #5 artifact — fresh extract, pinned torch 2.13.0 landed from the shipped code, 9.7GB model, correct image inspected at 74.95s
- [x] Windows re-validated on build #5 — clean extract, engine 0.29.2, model, correct image inspected at 11.30s (RTX 4060 Ti); darwin branch provably skipped on win32

**Standing lesson for this umbrella: a green checklist is not a validated release.**
Every automated signal — logs, timings, file size, gallery card — agreed on a build
that produced garbage. Only opening the image caught it. Any future generate-smoke box
on this card means LOOK AT THE PIXELS, not `Prompt executed`.
