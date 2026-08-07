# MPI-467 Checklist

- [x] Playbook skeleton — `docs/playbooks/bump-engine/` (README + `01-smoke-run.md`), routed
      from `docs/README.md` + `docs/playbooks/README.md`; `docs/versioning.md` healed
- [x] Smoke runner — `scripts/smoke-workflows.mjs`; `--self-check` and `--plan` both pass
- [x] Release gate — `checkSmokeEvidence()` in `scripts/release-health-check.mjs`, live in
      `npm run release:check`; all four branches proven; `mpi-release` precondition added
- [~] Free verification — `--plan` and `--self-check` ran; the **live GPU survey did not**
      (app not running on `:3000`)
- [x] **Gate 6 — Pod lock synced + DEV image built at ComfyUI 0.30.0** (2026-08-07)
      `node_lock.json` + `python_deps.txt` copied into `mpi-ci/cubric-vision-pod/`
      (`b6fa6c5`, `4d02e27`); drift closed: core `v0.29.2 -> v0.30.0`, workflow-templates
      `0.11.20 -> 0.11.27`, `ComfyUI-MpiNodes 69a43336 -> a6e5d5e0`,
      `comfyui-kjnodes 7f43f2ce -> 35e59561`. Both node commits verified present on their
      remotes BEFORE the sync — an unpushed MpiNodes commit would have failed the build
      after dispatch. `python_deps.txt` delta was provenance comments only, so 0.30.0
      resolves to the same pip set as 0.29.2.
      BOTH legs built + pushed in run `31157902185`, both pull-verified public:
      `v0.20.0-dev-cu130` (Docker Hub) + `v0.20.0-dev-cpu` (GHCR). cu130 printed
      `node-import smoke test OK` (every baked node imports on 0.30.0 — the MPI-341 gate),
      torch `2.12.0+cu130`, one opencv (`cv2 5.0.0 ximgproc True`). cpu boot-smoked on the
      **dev** runtime channel: `/health` 200, wrapper `0.2.41`.
      App consts bumped DEV-only (`13e34c31`): `POD_IMAGE_VERSION_DEV` /
      `_CPU_DEV = v0.20.0-dev`; stable pair still frozen at `v0.17.0`.
- [ ] Gates 7-9 — **DEFERRED to a later session, on the user's call**: the H3
      reference-to-video workflow has to land first, so the smoke set is complete when it
      runs. Nothing was rented; no GPU, no volume.
      🛑 **The `v0.20.0-dev` image already needs a REBUILD before that smoke.** MPI-472
      added `imageio-ffmpeg` to `python_deps` hours after the pod repo was synced, so the
      image built today does not contain it — and per MPI-472's own title that kills ALL
      video output, which is most of the smoke set (LTX, Wan, H3, wan22-5b). The image
      built clean; nothing in the build would have caught it. Re-sync BOTH files and
      rebuild once MPI-472's `python_deps` change is committed.
      Resume with: `node scripts/smoke-workflows.mjs --plan` — the drift check now covers
      `python_deps.txt` too (`a2b677f3`), so a clean ✓ there is the proof gate 6 held —
      then gate 7 asserts the Pod reports 0.30.0, then the matrix.
      Last plan: **11 models · 34 ops · 279.5 GB weights · 320 GB volume**, EU-RO-1.
- [ ] Proving run (scheduled with the user) — volume create + ~281 GB fill + one full pass
