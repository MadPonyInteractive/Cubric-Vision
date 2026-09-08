# Rename surface audit — 2026-09-08

Four read-only investigations (CI/release, docs/tests, mascot call sites, sibling repos).
The plan carries the load-bearing findings. This file carries what the plan does not: the
full **do-not-change inventory** and the sweep counts, which an implementer needs in order
to tell a real identifier from a display string.

## The installed-fleet contract

> **Superseded in part, 2026-09-08.** This section originally read "never change any of
> these". The plan's D1/D2 now heal the fleet with a 1.5.1 bridge instead of freezing the
> names forever. What stays true is *why* each one is load-bearing — that is what the bridge
> has to widen. Read this as the change list for Phase 0b, not as a prohibition.

| Thing | Where | What breaks if it changes with no bridge |
|---|---|---|
| `appId: 'cubric.vision'` | `build-portable.mjs:830` (asserted `:699,:1148`), `apply-update.cjs:246`, all 3 `release-baselines/*.json`, `resources/cubric/connector-manifest.json`, `tests/connector-responder.test.cjs:13,37,84,117`, `tests/portable-update-apply.test.cjs:38,48` | Old appliers reject the bundle: "Wrong update appId". **Kept at 2.0 (D2); the bridge only widens what is accepted.** |
| `CubricVision.exe` | `build-portable.mjs:41`, `:475`, `:499`; `win-update.cjs:64`; `windows/update.bat:15,16,21`; `update-from-zip.bat:18,20`; `tests/portable-win-layout.test.cjs:32,76,78` | The old applier relaunches a path that no longer exists. **Renamed at 2.0; the bridge widens the relaunch resolution and `RETIRED_PATHS` deletes the old binary.** |
| `CubricVision-*` archive names | `build-portable.mjs:1183,1192,1198`; `release-baselines/*.json` `rootName` | Every 1.x client's asset regex misses and the update fails to apply. **Renamed at 2.0, with the legacy names dual-published for that one release.** |
| The three shipped updater regexes | `win-update.cjs:26`, `linux/update.sh:74`, `macos/update.command:19,21` | These are *already on users' disks* — they cannot be fixed retroactively, only widened going forward. **This is exactly what the 1.5.1 bridge ships.** |
| `protocolVersion: '0.1.0'` | connector manifest | Handshake mismatch. Unchanged. |

## DO NOT CHANGE — verified identifiers

Changing any of these breaks something, and no bridge covers them. Each was read, not
assumed.

### On-disk paths (D3 — kept deliberately)

`routes/shared.js:53` `Documents/Cubric Vision/Projects` · `routes/shared.js:71`
`project-paths.json` · `main.js:269` `app.setName('Cubric Vision')` → Roaming AppData +
logs folder · `MpiNewProject.js:39` hint text naming that folder ·
`.github/ISSUE_TEMPLATE/bug-report.yml:78,79,80` (the three real per-platform log paths).

### Infrastructure that no GitHub rename touches

Container images have no 301 — renaming them is a deliberate republish:
`ghcr.io/madponyinteractive/cubric-vision-pod`, `docker.io/...`,
`ghcr.io/madponyinteractive/cubric-vision-builder`
(`mpi-ci/.github/workflows/cubric-vision-pod-image.yml:44,46,47,75,85,142`).

Folder names `mpi-ci/cubric-vision-pod/` and `cubric-vision-builder/` are read by
`release-health-check.mjs:35`, `smoke-workflows.mjs:1075`, `tests/remote-engine-assets.test.cjs:80`.

RunPod pod-name literal `'cubric-vision'` — the orphan sweep matches it exactly
(`.claude/hooks/guard-runpod-create.py:8,24,53`; `docs/runpod-remote-engine.md:89,183,191`).

RunPod template "Cubric Vision Builder" (id `2brluktxb4`) — registered externally.

Shared domains, unaffected by either rename but semantically odd afterwards:
`pod.cubric.studio/vision/`, `models.cubric.studio/vision/` — the `/vision/` prefix exists
to leave room for sibling apps that are now collapsing.

Other non-repo surfaces no rename reaches: Trello boards (`wg1r5aYz`, `0gEUiSvW`,
`KPXs5i8t`, `k5kFuJQc`), Gumroad slug `vfdxe` (marked never-edit), HF repo
`Mad-Pony-Interactive/cubric-studio` (marked never-delete), Fanvue handle `@cubric-vision`,
Discord category and forum tag, the Trello OAuth app named "Cubric Studio".

### Local folder names (D4)

`C:\AI\Mpi\Cubric-Studio` must keep its folder name even after the GitHub repo becomes
`Cubric-Connector`: `Cubric-Vision/package.json:29` resolves
`file:../Cubric-Studio/packages/connector`, and `Cubric-Prompt/src/main/index.ts:222`
hardcodes `'Cubric-Studio'` as a path segment — it fails *soft* into "Cannot find broker
CLI", which reads as a mysterious outage rather than a path error.

`C:\AI\Mpi\Cubric-Vision` must also keep its folder name — renaming it to `Cubric-Studio`
collides with the existing sibling.

### `.claude/skills/cubric-vision/`

The folder name is the skill's invocation name. Renaming it breaks `CLAUDE.md:32` and
`docs/playbooks/add-flow/06-preview-image.md:138,139`. Treat as an identifier.

## Sweep counts

| Bucket | Change | Keep (identifiers) | Never (history) |
|---|---:|---:|---:|
| `docs/` excl. archive + releases | 24 | ~74 | 3 |
| `docs/releases/` | 6 (4 live files) | ~50 | 24 (20 dated files) |
| `docs/archive/**` | 0 | 0 | **603** (85 files) |
| `tests/` | **0** | 22 | 4 |
| `README.md` | 7 (`:156` needs rewriting, not substituting) | 9 | 0 |
| `AGENTS.md` / `CLAUDE.md` | 0 | 3 | 0 |
| `.github/` | 5 | 7 | 0 |
| `.claude/` | ~20 (2 are generators) | ~85 | 0 |
| **Total** | **~62** | **~250** | **~634** |

Sibling repos: Cubric-Studio 54 lines/15 files · MadPony-Identity 1,834/393 (mostly dated
records that should not be rewritten) · Cubric-Prompt 327/134 · mpi-ci 132/26 ·
ComfyUi-MpiNodes 19/14.

## Two traps worth restating

**A redirect that succeeds is worse than one that fails.**
`MadPony-Identity/workflows/community/feature-request-tier-label.md:73` passes
`--repo MadPonyInteractive/Cubric-Studio`. Today that is the hub. After the rename it 301s
into what used to be Vision, and the command *works* — on the wrong repo.

**`tests/install-path-depth.test.cjs` asserts string lengths**, not just names: `:26`
`assert(BROKEN_ROOT.length === 95)` and `:27` `=== 63`, over fixtures containing
`CubricVision-windows-x64-v1.2.0`. Renaming those fixture strings breaks an arithmetic
invariant, not a name comparison.

## The one thing that removes work

No test asserts on the display name. `tests/desktop/electron-smoke.spec.js:23` is
`toHaveTitle(/Cubric/i)` — deliberately loose, matches both names. There is no wordmark or
brand-text assertion anywhere in `tests/`, and no test reads `productName` from
`package.json` or `electron-builder.yml`.
