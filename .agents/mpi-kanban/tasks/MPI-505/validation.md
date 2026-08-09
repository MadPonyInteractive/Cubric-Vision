# MPI-505 Validation

## Proven at the bench (2026-08-09)

Turbo, 864x480, 2s clip, warm, 4 runs: 91.59 / 90.07 / 96 / 91s against a 204.02s
two-stage non-turbo baseline. The 96 was a first-run warm-up artefact, confirmed by
two repeats. Quality: user judged turbo slightly below the 20-step path but acceptable
as an explicit opt-in trade.

R2 object verified three ways: rclone's own exit 0, byte-for-byte size match
(620,285,592), and HTTP 200 with matching Content-Length on the public URL.

## NOT yet verified

- The exported raw templates have NOT been through `sync-raw-workflows.mjs`.
- No app-side run exists - the toggle is not wired into the UI yet.
- `NOT LOADED` has not been checked for the EMA weight, so full key binding is assumed.
- i2v / fl2v / r2va turbo output has not been quality-reviewed (t2v only, and upstream
  documents t2v only).
- The 204.02s baseline is n=1 and gates the single-pass decision.

## Repo plumbing verified (2026-08-09)

Converted both raw H3 templates against the ENGINE on port 48188 (the 8188 bench was
down; it runs ahead and has silently shifted a widget before). `sync-raw-workflows.mjs`
itself is git-driven and the raw templates were already committed in `2b2df03f`, so a
bare run is a no-op — its steps were run per-file instead, on those two files only.

- Converter: no missing-required holes (it throws on any) for either template.
- `validate-injection-rules.mjs`: both files conform, 0 dangling links.
- `orchestrate.py`: rebuilt exactly the two H3 runtime files, skipped the other 9
  templates. r2va re-baked Input_Width/Height 1152x640 -> 864x480 and
  Input_Refs.ref_image_size max -> match.
- `git status` after: exactly 4 generated files changed, nothing else.
- Node-id churn is large on r2va (38 added / 22 removed) because the branch was
  re-pasted; harmless — `generate_h3.py` resolves every node by TITLE, not id, and
  `_assert_weights` passed.
- `loraDeps.js`: entry imports clean; `bytes` 620285592 matches the R2 object and the
  HF sibling listing, and `filename`'s tail equals the `lora_name` baked in BOTH
  runtime graphs (`minimax-h3\\minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors`).

Still NOT verified: no app-side run yet (control not wired), `NOT LOADED` not checked,
the 204.02s baseline is still n=1.

## App-side wiring verified (2026-08-09)

The toggle is wired end to end and every claim below was executed, not read:

- `node --test` on the 15 registry/graph-sensitive suites (inject-params-titles,
  resolve-model-deps, reuse-snapshot-defaults, negative-prompt-gate, op-strip-availability,
  uninstalled-op-gate, ratio-modes-exhaustive, licence-gate, preview-contract,
  prompt-partial-validation, lora-injection-routing, workflow-input-staging-gate,
  save-latent-recognition, reuse-video-audio-gate, media-slot-ordinal-roles):
  **85 tests, 0 fail**.
- `npx eslint` clean on `PromptBoxControls.js`.
- Wiring probe (bare Node against the real registries): both H3 cards declare
  `h3TurboToggle` and depend on `minimax-h3-turbo-lora`; **no non-H3 model arms the
  flag**; all three ops (`t2v_ms` / `i2v_ms` / `ref2v_ms`) list `h3Turbo`;
  the default is `false`; the control declares `nodeTitle: 'Input_is_Turbo'` and
  `scope: 'perModel'`; the gate line is present; the control does NOT emit
  `prompt:krea2-turbo`; `resolveDeps()` yields the turbo LoRA for both models.
- Both shipped graphs now bake `Input_is_Turbo: false` AND `Input_Single_Pass: false`
  (the bench exported both True, so this bake is load-bearing).

Two judgement calls worth recording:

- `orchestrate.py` hashes the TEMPLATE, not the generator, so a `BAKED_WIDGETS` edit
  alone rebuilds nothing. Rather than `--all` (which re-bakes all 17 templates), the two
  H3 entries were dropped from `.state.json` — targeted, and `git status` proves only
  the H3 pair moved.
- `js/utils/promptReuse.js` carries an EXPLICIT list of perModel keys that survive a
  Reuse. `h3Turbo` was added: without it, reusing an H3 run would silently drop the
  turbo state. Not in the handoff's pending list — found by sweeping krea2Turbo's
  consumers, per the root-cause rule.

## Still open (both need hardware, not code)

- The 204.02s two-stage baseline is n=1. It gates the single-pass decision, and nothing
  single-pass ships until it is re-run. `Input_Single_Pass` is baked False and has no
  control, so the graph's shape matches `progressStages.js` as it stands.
- `NOT LOADED` has not been checked in the Console for the EMA weight, so full LoRA key
  binding is still assumed rather than proven.
- No app run yet: the button has not been seen mounting on an H3 model, nor absent on
  LTX/WAN/Krea2. The gate is proven by construction (capability flag + probe), not by eye.

## Turbo stage-1 split 3 -> 4 (2026-08-09, after the first app test)

The user tested turbo in the app and rejected the 3-step stage 1 on a WIDE shot (three
dogs, small in frame) — unreadable. The earlier bench runs passed only because the
subject was close to camera. Re-exported both raw templates, re-synced against 48188.

- Converted output differs from the previous generation by EXACTLY one value per graph:
  `MpiInt` node 341 (fl2va) / 416 (r2va), `int: 3 -> 4`. Nothing else moved — no node
  added, removed, retitled, reclassed, or rewired.
- Validator clean on both; `orchestrate.py` re-baked only the two H3 runtime files and
  still forces `Input_is_Turbo`/`Input_Single_Pass` to False.
- Shipped graphs confirmed carrying `int: 4`.
- 24 graph-sensitive tests re-run, 0 fail.

**This invalidates the 90-96s turbo timings.** They were measured at 3+5; the shipped
graph is 4+4, one more step in the more expensive stage. Expect a few seconds slower —
still far inside the 204s baseline, but the "204s -> 96s" figure now needs a re-measure
before it goes anywhere user-facing. The UNRELEASED copy says "about half the wait" and
"about a minute and a half", which survives a few seconds either way; the exact numbers
in brief.md and docs/models/h3/performance.md do not.

## Single-pass shipped, driven by the run mode (2026-08-09)

The user asked for it either injected or given its own workflow file. Injected — a second
graph would duplicate a 71-node file whose only difference is one boolean, and
`singleFileStages` exists on both H3 cards precisely to avoid a twin.

**No control, and that is the point.** The stage split exists to PRODUCE a preview:
stage 1 stops early, the app collects its latent, stage 2 resumes the same schedule from
it. A run that is neither making a preview nor resuming one pays the seam for nothing —
so the run mode IS the value, and there is no toggle that can disagree with it:

    params['Input_Single_Pass'] = !_isPreview && !_isContinue;   // commandExecutor.js

It sits beside `Video_Latent.is_preview` / `.is_continue` in the `commandIsMultiStage`
block, so it derives from the same two flags — which means `historyMode` (which forces
`_isPreview` false) is honoured, and a stage-2 Finish correctly stays two-stage.

Bar count: `stagesFor` already took a per-run delta (`_enhanceBars`, read off the
injected params), so no new mechanism was needed — only its `Math.max(0, extraBars)`
clamp, which discarded negatives. Now `Math.max(1, recorded + extraBars)`, floored at 1
because 0 is the "unrecorded" signal that means "tick without a total". The delta is
gated on the loaded workflow CARRYING a node titled `Input_Single_Pass`, not on a model
id — the param is injected on every multi-stage run and lands nowhere on LTX/WAN, so
trusting the param alone would have subtracted a bar those runs never saved.

Verified (18 assertions + 34 tests, all green, eslint clean):

- `stagesFor` H3 single 2 -> 1 with the delta; preview 1 and stage2 1 unchanged;
  enhancer +1 still works and the two deltas cancel to 2; floored at 1 for any
  negative; an unrecorded workflow still returns 0, not 1; LTX 3 and WAN 2 untouched.
- The injection is inside the `commandIsMultiStage` block (it would fire on t2i ops
  otherwise), and is false on both a preview and a continue.
- Both H3 graphs carry `Input_Single_Pass` as an injectable `MpiSimpleBoolean`, and
  **no other shipped workflow carries one** — swept all of `comfy_workflows/`.
- `node --test` on preview-contract, save-latent-recognition, inject-params-titles,
  workflow-input-staging-gate, lane-agreement, tile-post-pass-stage, generation-store,
  snapshot-preserves-queued: 34 pass, 0 fail.

**Why open question 1 no longer gates this.** The brief made the n=1 204.02s baseline the
justification, on the theory that single-pass is a speed gamble worth ~30s. It is not a
gamble: the second sampler resumes the same schedule with the same sigmas, so a
straight-through run produces the same result either way and the split is pure overhead
when nothing reads the intermediate latent. The baseline is still worth re-measuring for
the NUMBERS in brief.md and docs/models/h3/performance.md — it just no longer decides
whether the feature exists.

Not yet verified: no app run since the change. Expect ONE bar and one `0/N` tqdm
sequence on a plain run, two when Preview initial stage is on.

## EasyCache gated off turbo + the real turbo figure (2026-08-09)

**Caught before it shipped, twice.** The first export wired the gate with the branches
inverted (turbo kept EasyCache, non-turbo lost it) AND stranded
`MiniMaxH3SigmaShift` on one branch; the second moved the strand rather than fixing it.
Neither was installed — the converted output was discarded both times and the generated
files were never touched. Only the raw commits landed, which is just the record of the
edit. This is why the sync converts and DIFFS before installing.

I was wrong about the SigmaShift half. I called it a regression on the non-turbo path;
`git log -S` shows the node entered in `2b2df03f` — the turbo commit — and
`2b2df03f^` has zero occurrences, so a non-turbo branch without it is exactly 1.3.1
behaviour. The user was right. The polarity bug was real and separate.

Final wiring verified in BOTH shipped runtime graphs (11 assertions each, all pass):
gate `[369]`/`[459]` on `Input_is_Turbo`, `true` -> SigmaShift, `false` ->
EasyCache, both reading the raw UNET and both feeding ONLY the gate, gate -> turbo LoRA.
Validator clean, 25 graph tests pass, `Input_is_Turbo`/`Input_Single_Pass` still baked
False.

### The numbers that replace the brief's headline

864x480, **5s**, single-pass, warm, n=2 each, decomposed from `app.log`:

| | turbo (8 steps) | non-turbo (20 steps) |
|---|---|---|
| total | **171.1s** | **220.1s** |
| per step | 16.09s (agreed to 2dp across a seed change) | — |
| decode (video+audio) | 38.4s | 36.8s |
| EasyCache skips | 0/8 | **8/20** |

**~22%, not the ~53% the brief claims.** The 204s -> 96s pair was measured at 2s, with the
split at 3, before single-pass, against a baseline with EasyCache OFF, and its 204.02s
half was n=1. The honest comparison is 12 computes vs 8, because EasyCache hands the
quality path a 40% step discount for free. `performance.md` now carries the
decomposition and an explicit warning not to quote the old pair.

Also pinned: ~38s decode and ~20s init are untouchable by turbo, and every FLIP of the
toggle costs a ~17s re-patch (17.7s vs 1.2s before the first bar) in either direction.

### EasyCache is video-only — disproven on Krea2

`cumulative_change_rate` resets after every computed step, so each printed value is one
step's predicted change. H3 0.10-0.22, Krea2 **0.45-0.49** against a 0.2 threshold: 0/25
skips, flat series, steady state. At 0.5 it skips 8/25 for ~16% of sampling and the image
came back visibly undercooked — the skips land in the low-sigma tail. No window between
"does nothing" and "degrades". Verdict + the one-run check for any future image model is
in `performance.md`; the Krea2 template was never exported.

Still open: no app run since the gate landed. First turbo run must print NO
`EasyCache enabled` and NO `skipped` line; first non-turbo run must print both.

## Gate verified live + turbo changes motion (2026-08-09)

**Gate confirmed in the app.** The post-sync turbo run (12:57, cold; 13:00, warm) printed
NO `EasyCache enabled` and NO `skipped` line at all - the lazy `MpiIfElse` means the
node never executes under turbo. Three `0/8` prints = one sampler, so single-pass is
still live. That closes the last code-side unknown on this card.

Worth: warm **171.07s -> 168.31s**, per-step 16.09 -> 15.56, **~1.6%**. My earlier "~6%
tax" was read off the whole turbo/non-turbo per-step gap; only half of it was EasyCache.
performance.md corrected. The gate is a correctness fix that happens to save 1.6%, not a
speed lever.

**The finding that actually matters is qualitative.** Turbo produces noticeably SLOWER
motion, and at low resolution shows no morphing, where the 20-step path runs at natural
speed but morphs substantially. Speed is post-fixable; morphing is not. That inverts the
toggle's meaning - at small sizes turbo can be the better output, not just the cheaper
one - and the release copy, which said "detail and fine motion are a step below the full
path", was wrong. Reworded.

NOT measured: one prompt, several runs, no fixed-seed A/B and no frame-by-frame motion
comparison. Recorded in performance.md as observed-not-proven. It should not move the
`h3Turbo: false` default until someone runs that A/B at two resolutions.

## Pod / Linux path safety (checked 2026-08-09)

Raised as a known repeat failure: adding a LoRA to a workflow breaks on the Pod because
the baked name carries Windows separators. **Already covered, and by machinery built for
exactly this case.**

`js/services/comfyController.js` ~L1438 heals every path-bearing loader input to `/`
whenever the target engine is not Windows-local, and its comment calls out BAKED values
specifically — they ship hardcoded in the workflow JSON and never pass through the
dropdown heal (`/comfy/list-files` -> `toEngineSep`). `MpiLoraModelClip.lora_name`
is matched by name in `PATH_INPUTS`. (MPI-141 remote, MPI-198 local Linux/macOS,
MPI-229 the inverse flip.)

Verified against BOTH shipped H3 graphs by running the heal replica over them (10
assertions, all pass), plus `tests/lora-path-separator-heal.test.cjs`:

    baked   minimax-h3\minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors
    healed  minimax-h3/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors

The healed value equals `loraDeps['minimax-h3-turbo-lora'].filename` minus the
`loras/` root, and is all-lowercase, so it also survives a case-sensitive FS (MPI-291).
No backslash survives the Linux heal in either graph.

**What this does NOT prove:** that the weight is present on the Pod volume. That is dep
staging, not path formatting. `resolveDeps` yields `minimax-h3-turbo-lora` for both H3
cards, so the plumbing is right, but nothing has run there. That is a smoke run
(`/mpi-bump-engine`, `node scripts/smoke-workflows.mjs --models minimax-h3`), and it
is the last open item on this card alongside the `NOT LOADED` console check.
