# MPI-469 — validation

## What shipped

Two edits, one root cause (`removed[]` must mean *a delete ran*):

1. `routes/downloadManager.js`, remote uninstall loop — `remoteUninstallDep`'s
   `'not_found'` now buckets into `keptModelFiles` with `reason: 'already-absent'`,
   the local twin's exact bucket and reason string. `unsupported` unchanged.
2. `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`,
   `download:uninstalled` handler — `already-absent` counts as GONE, not kept.

**Why (2) was in scope.** The brief said to read what `removed[]` drives in the
renderer before picking the fix shape. It drives toast copy and nothing else (no
counts, no freed-space text) — and a pure mirror of the local bucket would have MOVED
the lie instead of killing it: absent deps landing in `keptModelFiles` made the handler
toast *"model files kept on disk; still installed"* for a model with nothing left. The
LOCAL engine has had that toast bug since MPI-276. One handler fix covers both engines.

## Evidence

### 1. Route, wrapper stubbed — `tests/remote-uninstall-reporting.test.cjs` (new)

Drives the REAL `POST /comfy/models/uninstall` over express on an ephemeral port with
`isRemoteActive`/`remoteModelsCheck`/`remoteUninstallDep` stubbed on the required
`remoteModels` module. No Pod, no network. Three cases:

- **The measured shape** — 1 dep on the fake volume, the rest never there:
  `removed[] === [thatOne]`, every other dep in `keptModelFiles` with
  `reason:'already-absent'`.
- **Empty volume** — `removed.length === 0`, all deps `already-absent`.
- **Old Pod image** (`unsupported` for every dep) — still returns
  `success:false, remoteUnsupported:'uninstall'`. This is the brief's watch-item: the
  early-return is reached MORE often now, and that is the right answer.

```
ℹ pass 1   ℹ fail 0
```

**Negative control run.** Disabling only the new `not_found` branch (`else if (false &&
…)`) fails the test at the first assertion —
`AssertionError: only the dep that was on the volume may be reported removed` — then
restored and re-run green. The test fails for the reason it exists.

Live log lines from the run, which are what the Pod used to lie about:

```
[INFO] [download] remote uninstall: boogu-qwen3vl-8b-clip already absent on the volume — nothing removed
[INFO] [download] remote uninstall boogu-edit-balanced: removed 1, kept 0 universal, 0 shared, 2 model files, swept 0 orphaned
```

### 2. Renderer, REAL handler in a browser

The toast branches are inline in a mounted component, so they were driven for real:
`playwright-cli` on the running app → Model Library → `import('/js/events.js')` and
emit `download:uninstalled` while subscribed to `ui:success`/`ui:info`.

| payload | toast |
|---|---|
| `removed:[]`, 2× `keptModelFiles{reason:'already-absent'}` | **success** — "Krea 2 NSFW updated." |
| `removed:[1]` + 1× `already-absent` | **success** — "Krea 2 NSFW updated." (no false "some shared files kept") |
| `removed:[]`, 1× `keptModelFiles` with NO reason | **info** — "model files kept on disk; still installed." (unchanged) |

Before the fix, row 1 produced the third message — the model was gone and the app said
it was still installed.

("updated" not "uninstalled" is the MPI-394 verb split — `_wholeUninstalls` was not
primed by a synthetic emit. Not this card.)

### 3. Suite

`npm test` → **475 pass / 3 fail**. The three failures
(`optional-media-placeholder`, `output-prompt-capture`, `resolve-model-deps`) are a
PEER session's in-flight LTX work, not this card: they are in the peer's own modified
files, and they still fail with both of this card's edits stashed.

## Not done here

No live Pod run. The route path is fully exercised against the wrapper contract as the
wrapper actually implements it (`wrapper.py models_delete` returns
`"deleted" if existed else "not_found"` — read, not assumed), and this card deletes
nothing new: it only stops CLAIMING deletes. A CPU download-mode Pod would confirm
end-to-end for pennies if wanted ([[tool_cpu_pod_verifies_wrapper_paths]]).
