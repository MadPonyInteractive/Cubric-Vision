---
name: mpi-bump-local-comfy
description: Upgrade the standalone LOCAL ComfyUI authoring bench (G:\ComfyUi) to a target version and keep its hand-maintained extra_model_paths.yaml in sync with the app's dep folder types. Use when the user says "bump my local ComfyUI", "update my test ComfyUI", "upgrade the local bench to <version>", or reports that a weight in G:\CubricModels is missing from a node dropdown in the standalone install.
user-invocable: true
---

# Bump the LOCAL ComfyUI bench

Upgrades the standalone authoring ComfyUI and fixes the yaml drift that silently
empties node dropdowns. Two separate jobs — the user usually asks for one and needs
both checked.

## THE INSTALL — get this right first

There are **TWO** portable ComfyUIs on this machine. They are not the same install
and an upgrade to the wrong one is a silent no-op:

| | Path | What it is | Port |
|---|---|---|---|
| **Bench** (this skill) | `G:\ComfyUi\` | Standalone authoring bench. Git checkout, **hand-maintained** yaml | 8188 |
| Engine | `<repo>\engine\ComfyUI_windows_portable\` | The one Cubric Vision drives. Yaml **generated** by `routes/yamlHelper.js` | 3000-driven |

Both read the same weights at `G:\CubricModels`. Bench context (authoring folder,
models dir, two-stage test flow) is canonical in
[docs/playbooks/add-model/01-workflow-split.md](../../../docs/playbooks/add-model/01-workflow-split.md) § 0a — read it, don't restate it.

**Never touch the engine's yaml by hand** — `yamlHelper.js` regenerates it on every
`/comfy/set-path`, so hand edits vanish. Engine folder gaps are a code fix in
`coreExtras`, not a file edit.

## Step 0 — confirm which install, from the process

Don't infer from the user's words. `--output-directory D:\WORK\Images\Outputs` in the
command line = the bench.

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | Format-List"
curl -s --max-time 5 http://127.0.0.1:8188/system_stats | python -c "import sys,json;print(json.load(sys.stdin)['system']['comfyui_version'])"
```

## Step 1 — yaml sync (do this even for an upgrade-only request)

The bench yaml (`G:\ComfyUi\ComfyUI\extra_model_paths.yaml`) is hand-written, so it
drifts behind the app every time a dep introduces a new folder type. Symptom is a
node dropdown that enumerates **empty** while the weight sits on disk.

Diff the app's folder keys against the bench's `cubric_models:` block. The app's list
is derived at [routes/yamlHelper.js](../../../routes/yamlHelper.js) — dep filename first
segments (`dependencies.js` + `assetDeps.js`) plus `coreExtras`:

```bash
node -e "const{DEPS}=require('./js/data/modelConstants/dependencies.js');console.log([...new Set(Object.values(DEPS).filter(d=>d.type!=='custom_nodes'&&d.filename).map(d=>d.filename.split('/')[0]))].sort().join('\n'))"
```

Add any missing key as `<key>: <key>/` under `cubric_models:`. Keep it alphabetical.

> A key only resolves if ComfyUI **registers that folder type** — check
> `folder_paths.py` in the target version. `background_removal` exists from 0.27;
> a type the version doesn't register won't work no matter what the yaml says.

## Step 2 — upgrade

Stop the server first (it holds file locks; a live swap half-loads the tree). Kill by
**PID scoped to `G:\ComfyUi`** — other agents may be running the app on port 3000.

```bash
powershell -NoProfile -Command "Stop-Process -Id <PID> -Force"
curl -s --max-time 4 http://127.0.0.1:8188/system_stats >/dev/null 2>&1 && echo "STILL SERVING" || echo "port clear"
```

Back up the yaml (untracked → not protected by git), then checkout the tag:

```bash
cd /g/ComfyUi/ComfyUI && git fetch --tags origin && git status --porcelain   # must be clean
git checkout v<X.Y.Z>
cd /g/ComfyUi && ./python_embeded/python.exe -s -m pip install -r ComfyUI/requirements.txt
```

**Default to the version the app's engine is on** — the bench exists to mirror it, and
a newer bench proves nothing about what ships. Confirm with the user before picking a
higher tag.

## Step 3 — the node-floor pairing check

Core bumps break version-sensitive custom nodes. **Before** bumping past a known-good
tag, check `MEMORY.md` for the current pairing constraint and confirm with the user.
Standing one (verify it still applies — the tag moves):

> Past **0.28** breaks `Krea2EditModelPatch` unless `comfyui-krea2edit` bumps past
> `dc7940f4` (v1.2.1) in the SAME pass. Core commit `c9602625` is the trigger.

## Step 4 — verify (all three, live)

Boot in background, wait for the GUI line, then assert against the **running server** —
not against the files.

```bash
grep -iE "IMPORT FAILED|cannot import|Traceback" <boot.log>    # must be empty
curl -s http://127.0.0.1:8188/system_stats | python -c "import sys,json;print(json.load(sys.stdin)['system']['comfyui_version'])"
curl -s "http://127.0.0.1:8188/object_info/LoadBackgroundRemovalModel" | python -c "import sys,json;print(json.load(sys.stdin)['LoadBackgroundRemovalModel']['input']['required']['bg_removal_name'][1]['options'])"
curl -s "http://127.0.0.1:8188/object_info/ControlNetLoader" | python -c "import sys,json;print(json.load(sys.stdin)['ControlNetLoader']['input']['required']['control_net_name'][0])"
```

Version matches target, zero import failures, dropdowns non-empty. A yaml edit does
nothing until restart — `folder_paths` reads it once at boot.

## Step 5 — hand back

**Ask before leaving the server running.** The user may have other agents on the
machine; a stray 8188 process can interfere. Report: version before→after, deps
bumped, yaml keys added, custom-node import result.

Nothing here touches the repo — no commit unless `yamlHelper.js` needed a `coreExtras`
fix, which is a real code change and follows normal commit rules.
