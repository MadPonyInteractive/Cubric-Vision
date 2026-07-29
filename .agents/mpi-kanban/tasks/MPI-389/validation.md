# MPI-389 — validation

Closed 2026-07-30. Card scope (the 3 `permodel-key-allowlist` failures) plus the
follow-on question (the other 6) — all resolved. **Suite is 275/275, zero failures.**

## 1. `permodel-key-allowlist.test.cjs` — DELETED, not rewritten

The brief allowed rewrite-or-delete. Delete is the right call, and it is not a
"the test was annoying" delete — the file's premise no longer exists:

- The test cross-checked TWO hand-maintained lists. MPI-336 removed one of them
  (`_MODEL_WIDE_KEYS` → a `modelWide` flag derived from the control's own `scope`).
- Its second assertion cross-checked a per-key snapshot list in `generationService`.
  That list is gone too — `_snapshotControlState` now does
  `const _model = _clonePlain(_ms)` and clones the model bucket **wholesale**
  (generationService.js:411-416 documents exactly this).
- So there is nothing per-control left to enumerate. Verified the emitter set is
  CLOSED — `settings:model:update` has exactly four emit sites:
  `MpiModelSettings.js:346/347` (legacy loras/upscaleModel) and
  `PromptBoxControls.js:69/86` (perOp with an opName; perModel with
  `modelWide: true`). Every perModel control funnels through the single
  `_emitUpdate` branch at line 86 — no per-control opt-in to forget.

What remained assertable was three single-line branches in three files. A regex
test over those lines fires false alarms on renames (which is precisely how this
file rotted) at a higher rate than it catches a break — and a break there breaks
EVERY perModel control at once, loudly, on the first slider drag.

Checked before deleting: nothing outside `.agents/` archives references the file
(no npm script, no CI step).

**Replacement guard = the contract doc.** `js/events.js` documented
`settings:model:update` without `modelWide` at all, still telling readers to omit
`opName` "only for model-wide keys (loras, upscaleModel)" — the stale design the
test was defending. Fixed there instead.

Not attempted, and why: a behavioural test needs `PromptBoxControls.js`, which is
not importable under Node — `MpiButton.js` imports `/js/utils/icons.js` (a
browser-absolute path), so `import()` dies with `Cannot find module 'C:\js\utils\icons.js'`.
Building a loader hook to work around that costs more than the guard is worth.

## 2. The other six — all stale too, all fixed

| test | root cause | fix |
|---|---|---|
| `optional-media-placeholder` | MPI-272 dropped `placeholder.png` / `ltx_silence.wav` from `WORKFLOW_INPUT_DEFAULTS` (image/audio moved to self-gating `MpiLoadImageFromPath` / `MpiLoadAudio` path nodes; latents are the only staging survivors). Test still expected them. | `STAGED` narrowed to the 3 latents; positive control repointed at LTX `Input_Video_Latent`; negative control added |
| `resolve-model-deps` | expected `LTX_t2v.json`; models.js **and** the files on disk are lowercase `ltx_t2v.json` | lowercased the 3 real-registry assertions |
| `remoteProxy` ×4 | **the real one.** MPI-175 split `remoteProxy.js` into a barrel over `remotePodState` / `remotePodLifecycle` / `remoteProxyForward`. The harness's `fresh()` only dropped the barrel, so the remote-mode singleton in `remotePodState` (and the load-time destructured `remoteEngine` bindings in the other two) survived between tests — a prior test's `pod-old` leaked forward, and `getRunPodApiKey` mocks never bound | `dropProxyFamily()` clears all four modules together, AFTER the mocks are installed |

The remoteProxy fix is a harness fix, not a production one: `remotePodState._mode`
is a process singleton **by design** (one app, one remote mode). The leak only
matters because a test process runs many "apps".

Not passing for the wrong reason — the teardown cases still assert the mocked
client received `['pod-stop']` / `['pod-delete']`, and the interrupt case still
requires a genuinely inactive mode to return 409.

## Evidence

```
before:  9 failures — optional-media-placeholder, permodel-key-allowlist ×3,
                      resolve-model-deps, remoteProxy ×4
after :  ℹ tests 275   ℹ pass 275   ℹ fail 0
```

Runner: `node --test tests/*.test.cjs` (there is no `npm test`; `node --test tests/`
treats the directory as a module and dies).

## Standing note

The suite now has **no** known-failing baseline. Any red is a real regression —
the "9 pre-existing failures, check the list not the count" caveat is retired.
