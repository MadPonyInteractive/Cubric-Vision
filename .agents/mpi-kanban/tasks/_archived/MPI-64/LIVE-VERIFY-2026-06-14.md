# COMBINED live-verify driver — 2026-06-14 fresh-volume session

> ONE live fresh-volume + Pod cycle validating EVERYTHING that needs it (the volume delete + reinstall is
> expensive — batch it). USER executes all live Pod/volume/billing ops; Claude drives + observes.
>
> Bundles **MPI-75 v0.4.0 validation** (build agent's "your turn" ops, image already shipped) +
> **A1** engine-drop recovery + **G5** volume-delete-with-attached-Pod + **F8** quit/crash + **B/T2V** remote video.

## Build state (from the agent's morning report)
- **v0.4.0 Pod image SHIPPED**, both profiles cu124 + cu128, GHCR public, wrapper **0.2.3**.
- App coupling DONE (uncommitted): `POD_IMAGE_VERSION='v0.4.0'` + `WRAPPER_VERSION='0.2.3'` in
  `routes/remoteProxy.js:59-60`. mpi-ci already pushed (`d9c7310..4763fd1`).
- **Shipped in v0.4.0:** `/wrapper/models/delete` remote uninstall (was G3, previously 404-toasting) +
  **aria2c** fast download (`-x16 -s16`, ~10-40× httpx; was G4) + Dockerfile apt `aria2`.
- **Still OPEN on MPI-75 (NOT built, decision-pending):** `--cache-lru 2` (D1), `/wrapper/free` (D2),
  future cu130 (G/D). These are NOT testable this session — no image has them.

## ⚠️ RESTART, not Ctrl+R
`routes/remoteProxy.js` changed (backend) → a **FULL app restart** is required before ANY of this validates
(you've run `npm start` — good). A1 is renderer-only but rides the same restart. After restart, A1 is live too.

---

## Order of operations (top-to-bottom; each step feeds the next)

### 0. Pre-flight
- [ ] App fully restarted on the new `remoteProxy.js` (v0.4.0 / wrapper 0.2.3). Console clean.
- [ ] *(Optional, agent's note)* `wsl --shutdown` to reclaim Docker VM RAM — agent SKIPPED it (shared-box
      safety). Do only if you want the RAM back and nothing else needs WSL right now.

### 1. G5 — delete the CURRENT volume (the expensive event, done once)  `[A1/G5 verify]`
- [ ] Settings → RunPod → Delete the current network volume (with its Pod attached/recent).
- [ ] **EXPECT:** confirm dialog warns the attached Pod is deleted first; on OK app deletes Pod THEN volume;
      both gone in the RunPod console; NO "delete the Pod first / attached" error on the happy path.
- [ ] **PASS → G5 done.**

### 2. MPI-75 v0.4.0 — fresh Pod + aria2c + remote uninstall  `[MPI-75 verify, agent's ops]`
- [ ] Create a FRESH volume in the target DC.
- [ ] Connect → **redeploy a fresh Pod off v0.4.0** (confirm in app.log the image tag is `…:v0.4.0-cu124` for
      a non-Blackwell card, `-cu128` for Blackwell).
- [ ] Reinstall the model set (Wan 2.2 + SDXL etc.) onto the fresh volume.
- [ ] **EXPECT (aria2c):** model install is dramatically faster than before — Wan weights drop from
      **minutes → seconds/low-minutes** (the ~10-40× win). Watch the download SSE rate.
- [ ] **EXPECT (remote uninstall):** uninstall a model in the Models panel → it actually **deletes from the
      volume** now (was 404-toasting pre-v0.4.0). Confirm the file is gone (status flips to not-installed).
- [ ] **PASS → MPI-75 G3 (models/delete) + G4 (aria2c) verified.** (D1/D2/cu130 stay open — not in this image.)

### 3. B / T2V — remote video generation  `[B verify, PARTIAL]`
> CAVEAT: B1 input-asset transfer (video/audio upload, trimmed-video, remote `.latent`) is NOT coded →
> **I2V (needs image input) is NOT testable.** **T2V needs no input → IS testable.**
- [ ] On the fresh volume + connected Pod (64GB+ RAM recommended — video is container-RAM-bound; an L4 ~57GB
      OOMs even small T2V → which is fine, it doubles as the A1 drop trigger in step 4), run a **remote T2V**.
- [ ] **EXPECT (T2V):** multi-stage preview/final completes; latent preview frames in the queue panel;
      progress updates; video saves to the project with metadata + ffmpeg thumbnail; cancel/interrupt works.
- [ ] **PASS → B-T2V done;** B-I2V stays OPEN behind B1.

### 4. A1 — engine-drop recovery  `[A1 verify]`  (renderer code already shipped this session)
> No real OOM needed — any sustained WS death hits the same `_onWsDropped → remote:engine-dropped` path.
> Trigger: stop the Pod / kill the wrapper from the RunPod console MID-gen, OR let a heavy T2V OOM the Pod.
- [ ] Connect, start a generation, **force a drop mid-gen**.
- [ ] **EXPECT:**
  - [ ] stuck gen ENDS cleanly (spinner stops) with the OOM-aware failure message (existing B4 modal);
  - [ ] info/warning **toast**: "Remote engine disconnected — … Reconnect from Settings → RunPod";
  - [ ] landing hero = **`remote · disconnected`** (NOT `local · offline`, NOT the local GPU card);
  - [ ] gallery status bar = **`IDLE · Disconnected`** (NOT `IDLE · Local`);
  - [ ] DevTools Network: request volume stays FLAT (no runaway pile-up);
  - [ ] project/model panels do NOT falsely blank to local/empty.
- [ ] **Manually Reconnect** (Settings → RunPod → Connect).
- [ ] **EXPECT on reconnect:** hero → `remote · online` + Pod card; status bar → `IDLE · Remote`; model panel
      re-hydrates (connect-edge `syncModelInstalled`); a generation works again — **NO app relaunch anywhere.**
- [ ] **PASS → A1 done.**

### 5. F8 — lifecycle cleanup on quit/crash  `[F8 verify]`
- [ ] **Clean quit, box OFF:** Pod up + "Delete Pod on quit" OFF → quit → Pod goes EXITED (warm, no GPU bill).
- [ ] **Clean quit, box ON:** "Delete Pod on quit" ON → quit → Pod DELETED.
- [ ] **Simulated crash:** Pod up → KILL the app process (Task Manager, not clean quit) → confirm the Pod-side
      **idle watchdog** stops the Pod within its window (~15 min — can confirm in the console later).
- [ ] **Cost warning:** user sees the storage-still-bills warning for the remaining volume.
- [ ] **PASS → F8 done.**

---

## After the session — bookkeeping (Claude)
- [ ] Mark in `OPEN-ITEMS.md`: G5 ✓, A1 ✓, F8 ✓, B-T2V ✓ (B-I2V open behind B1), and MPI-75 G3+G4 ✓
      (D1/D2/cu130 still open). Date each.
- [ ] Append verification events to `tasks/MPI-64/events.jsonl`.
- [ ] If A1 PASS + USER authorizes: commit the A1 renderer files (`js/shell.js`, `js/shell/heroStats.js`,
      `js/shell/statusBar.js`) + the kanban docs. NOTE: `routes/remoteProxy.js` (v0.4.0/wrapper-0.2.3) is the
      build agent's MPI-75 edit — commit it WITH the MPI-75 close-out, coordinate so it isn't double-committed.
- [ ] Add the A1 entry to `current-architecture.md` §10.

## Open after this session (not validatable here — need the next image rebuild)
- D1 `--cache-lru 2`, D2 `/wrapper/free` (+ remote Release-VRAM/RAM), cu130 Blackwell — all MPI-75 NEXT rebuild.
- E1 `/wrapper/restart-comfy` (custom-node remote restart) — MPI-75 NEXT rebuild.
- B1 remote input-asset transfer (unblocks remote I2V) — app code, not yet written.
