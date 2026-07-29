# MPI-391 Checklist — 1.3.0 cross-platform validation sweep

Tick as verified. Each item names the card that OWNS the result — write the
evidence into that card's `validation.md`, not here. Detail for every line is in
`brief.md`.

## A · At the build cut (blocks everything below)

- [ ] 1.3.0 artifacts built for win32-x64, linux-x64, macos-arm64 — *release*
- [ ] Windows update bundle root reads `CubricVision-v1.3.0-update-only` — *MPI-369*
- [ ] Update asset name is exactly `CubricVision-windows-x64-update-v1.3.0.zip` (FROZEN — shipped updaters glob it) — *MPI-369*
- [ ] 1.3.0 update manifest reads `from 1.2.0`, not `null` — *MPI-369*
- [ ] File counts sane vs baseline 6362 win32 / 6505 darwin / 6325 linux — *MPI-369*
- [ ] `release-baselines/win32-x64.json` restamped from the shipped FULL manifest — *MPI-387 lineage*

## B · Windows — Smart App Control laptop

- [ ] `where git` finds nothing (precondition, else fix B proves nothing) — *MPI-387 B*
- [ ] Explorer "Extract All" into default Downloads → ONE folder, `CubricVision.exe` directly inside — *MPI-387 A*
- [ ] `CubricVision.exe` launches: SmartScreen → More info → Run anyway (NOT a silent block) — *MPI-387 D* ← **most important result of the day**
- [ ] Engine install completes; no `Cannot find command git` — *MPI-387 B*
- [ ] No MAX_PATH / Long-Path HINT from LTXVideo pip — *MPI-387 A*
- [ ] No `Illegal transition ComfyUI-Frame-Interpolation: complete -> downloading` — *MPI-387 F1*
- [ ] The no-GPU fallthrough WARN appears (presence = fix working) — *MPI-387 F2*
- [ ] `cupy-wheel` build failure followed by "succeeded" seen and IGNORED as expected — *MPI-387 F3*
- [ ] Any real failure names the node + real phase, never "extraction failed" — *MPI-387 C*
- [ ] `app.log` captured from `<extract root>/user-data/logs/` — *MPI-387 evidence*
- [ ] Real v1.2.0 install updated in-app to 1.3.0: files copied, `start.vbs` gone, stale `app/` left behind — *MPI-387 D transition*
- [ ] Same run: in-app update prompt's real fetch + spawn worked — *MPI-334* (first live test ever)

## C · macOS — rented Mac

- [ ] `xattr -dr com.apple.quarantine "<folder>"` → `start.command` launches — *MPI-370*
- [ ] A **DEPTH** model installs without the Installation-failed error — *MPI-370* ← the specific path that pulls `controlnet_aux`
- [ ] The `requirementsDrop` log line is PRESENT (absence = the field vanished through `_createDepJob`'s whitelist) — *MPI-370*
- [ ] Plain install → launch → generate smoke passes — *MPI-370* (macOS generation has never been validated)

## D · Linux — separate machine

- [ ] Loader-path heal reproduced: LOCAL engine + **subfoldered** LoRA — *MPI-198* (see its `plan.md` / `checklist.md`)
- [ ] Plain install → launch → generate smoke passes — *MPI-198* (Linux generation has never been validated)

## E · Opportunistic

- [ ] If a download stalls during any install above, note whether it self-heals — *MPI-291* (never seen fire; do not force it)

## Close-out

- [ ] Every result written into its OWNING card's `validation.md`
- [ ] Each owning card moved
- [ ] Deferred items recorded with a reason (see `brief.md` § E)
