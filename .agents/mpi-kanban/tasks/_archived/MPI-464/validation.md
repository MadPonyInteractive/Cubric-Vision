# MPI-464 — validation

Status: **PASSED on a live Pod, 2026-08-07.** The bar the card set was met — read-only
classification read first, then a real delete, on a real volume.

## Unit evidence

`tests/orphan-sweep-remote.test.cjs` — 5/5, and `npm test` 477/477 with it in the glob.
Runs the REAL `_remoteSharedDepIds` / `_orphanedDepIds` / `_sweepOrphanedDepsRemote`
against a fake volume (the two wrapper calls stubbed on the required `remoteModels`
module): collects an unwanted dep, refuses one a volume-installed model still wants,
proves the inventory gate (eligible but absent ⇒ `remoteUninstallDep` never called),
treats `unsupported` as a whole-sweep no-op, and asserts the classifier never yields
`custom_nodes` / universal / `targetPath` / `bakedOnPod`.

## Pod run — 2026-08-07

**Setup.** CPU download-mode Pod (`gpuTypeId: '__cpu__'`, `cpu3c`), network volume
`9t3awufudk` / `EU-RO-1` (150GB), wrapper **0.2.41** — far past the v0.4.0 / 0.2.3 floor
where `/wrapper/models/delete` ships. No GPU: the sweep only needs
`/wrapper/models/status` + `/wrapper/models/delete`, so a GPU Pod would have been pure
cost. Ready in ~20s. Driven entirely over the app's own HTTP routes on `127.0.0.1:3000`
(create, install, uninstall, check) plus a temp read-only probe route, since remote-mode
state lives in the running server process.

**1 — Read-only classification (the step MPI-310 skipped).**

```
protected: 71   eligible: 35   depsEchoed: 35   onVolume: 0
```

`depsEchoed === eligible` is the load-bearing number: it proves the wrapper answers a
**pseudo-model carrying 35 deps** without dropping any. A short echo would have read as
"no orphans" while silently under-collecting — the one failure mode the unit test cannot
see. This is also the piece with no local analogue.

`onVolume: 0` was verified dep-by-dep rather than taken on trust. Four models were fully
installed (`krea2` 26/26, `klein-4b` 21/21, `ltx-23` 12/12, `qwen-edit` 14/14). The two
suspicious-looking partials both explain cleanly:

- `boogu-edit-high` / `boogu-edit-balanced` at 4/7 — the 4 present are **custom_nodes
  only**; all three weights (including the 10.59GB `boogu-qwen3vl-8b-clip` that stranded
  locally in MPI-462) are absent. Nothing to collect.
- `ltx-23-balanced` at 11/13 — every one of its 11 present weights is genuinely defended
  by the installed `ltx-23`; only its two exclusive transformers are missing. Correctly
  protected, not orphaned.

**2 — A seeded orphan, and a finding on the first attempt.**

First seed was `vae-sd3` (168MB). It did **not** become an orphan, and that is the
MPI-310 exclusive-evidence rule working exactly as designed: `vae-sd3` is declared by
`nvidia-pid` **alone**, so putting it on the volume made it that model's exclusive
evidence and resurrected `nvidia-pid` as installed — `protected` 71→79, `eligible` 35→27,
`onVolume` still 0. **A seeded orphan must be a dep declared by ≥2 models, none
installed**, or the seed defends itself. Worth knowing before anyone re-runs this.

Second seed: `chroma-style-lenovo` (107MB, declared by `chroma-flash` + `chroma-hyper`,
neither installed, not universal) — one of the very Chroma style LoRAs MPI-462 found
stranded locally. Classification then read:

```
protected: 79   eligible: 27   depsEchoed: 27   onVolume: 1
  -> chroma-style-lenovo | loras/chroma/styles/lenovo_chroma.safetensors | 107MB
```

Exactly one, and `vae-sd3` correctly **not** listed.

**3 — Negative control, `deleteFiles: false`.** Uninstalled `nvidia-pid`:

```
removed: none | keptShared: vae-qwen-image | keptModelFiles: 8 | sweptOrphans: []
[download] remote uninstall nvidia-pid: … swept 0 orphaned (deleteFiles=false)
```

No `remote sweep:` classification line at all — the sweep never ran, and the orphan
survived. "Keep files" keeps every file, not only the selected ones.

**4 — Positive control, `deleteFiles: true`.** Same model:

```
removed      : pid-flux1,pid-sdxl,pid-sd3,pid-qwenimage,vae-flux-ae,vae-sdxl,vae-sd3,pid-gemma
keptShared   : vae-qwen-image
sweptOrphans : [{"depId":"chroma-style-lenovo","depName":"Chroma Style — Lenovo"}]

[download] remote sweep: 71 protected, 35 eligible, 1 on volume
[download] remote sweep: deleted chroma-style-lenovo (loras/chroma/styles/lenovo_chroma.safetensors) from the volume
[download] remote uninstall nvidia-pid: removed 8, kept 2 universal, 1 shared, 0 model files, swept 1 orphaned (deleteFiles=true)
```

`protected` reads 71 again, not 79 — the sweep runs **after** the delete loop, so
`vae-sd3` was already gone and `nvidia-pid` had lost its exclusive evidence. The
classification is computed against post-delete truth, which is what makes the sweep able
to see an orphan the uninstall itself created.

`vae-qwen-image` (declared by the installed `krea2` and `qwen-edit`) survived — the guard
held while the sweep deleted beside it.

**5 — Post-state, confirmed from the volume, not from the response.**

```
SWEEP PREVIEW -> protected: 71  eligible: 35  depsEchoed: 35  onVolume: []
FULLY INSTALLED: krea2 (26/26), klein-4b (21/21), ltx-23 (12/12), qwen-edit (14/14)
nvidia-pid still on volume: vae-qwen-image, ComfyUI-MpiNodes, comfyui-kjnodes
chroma-flash still on volume: (nodes only — the LoRA is gone)
```

Identical to the pre-test read. **Net change to the user's volume: zero.** Everything
deleted was seeded by this test; every pre-existing file survived. `nvidia-pid`'s other
deps appear in `removed[]` because the remote branch reports a dep removed unless the
wrapper answers `unsupported` — those files were never on the volume (it read 3/11
before the run). That reporting quirk is pre-existing behaviour of the remote uninstall
branch, not introduced here, and is the one thing this run surfaced that is worth a
separate look.

**Teardown.** Pod deleted (`/remote/pod/delete-active` → `{"deleted":true}`, mode back to
inactive). The 150GB volume persists — it is the user's data. The temp probe route was
reverted and `git diff` on `routes/downloadManager.js` confirmed byte-identical to HEAD
before committing; the app was restarted and the route confirmed 404.

## Why the bar existed

Both directions of this guard have failed live: MPI-310 destroyed 5.24GB of user data
with an adjacent change to it, and MPI-258 B1 left ~19GB undeletable swinging the other
way. Step 1 (read the list before deleting anything) is the step that makes those
failures visible in advance, and it is the one that must never be skipped on a re-run.
