# MPI-536 Validation

Shipped app-side 2026-08-14 as the Flow `ltx-foley`. Doc:
`docs/playbooks/add-flow/existing-flows/ltx-foley.md`.

## Phase 1 — the weight is on R2

```
rclone lsl  -> 226709270  ltx-2.3-22b-lora-foley-v2a-1.0.safetensors
curl -I https://models.cubric.studio/vision/models/loras/ltx-2.3/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors
  HTTP/1.1 200 OK
  Content-Length: 226709270
```

sha256 `1bc16020f3937f1dc4957b24c713bc04ec550d6502db8c3e1dd822c412e1fb85` (computed on the
local file before upload; byte count matches on both ends).

**No mirror is possible.** `Lightricks/LTX-2.3-22b-LoRA-Foley-V2A` is a GATED repo — an
anonymous fetch returns `401` + `X-Error-Code: GatedRepo`. Comfy-Org's `split_files/loras`
does not carry the file. `FuzzPuppy/LTX-2.3-Foley-LoRA` is a different community train
(`ltx-2.3-foley-400-steps.safetensors`), not these bytes. So `ltx23-lora-foley` ships with no
`mirrorUrl`, deliberately.

## Phase 2 — the dep resolves on the right tier only

```
url matches filename invariant: true
mirrorUrl absent: true
ltx-23           -> has foley: false | dep count 13
ltx-23-balanced  -> has foley: true  | dep count 14
node --check loraDeps.js models.js -> OK
```

## Phase 3 — workflow synced against the APP engine

`COMFY_URL=http://127.0.0.1:48188 node scripts/sync-raw-workflows.mjs`

```
Changed raw workflow(s): flow_ltx_foley.json
OK    flow_ltx_foley.json -> comfy_workflows/flow_ltx_foley.json
Validating injection rules...
All 1 file(s) conform to the injection rules.
```

53 API nodes. `Foley_Lora#100` loads `ltx-2.3\ltx-2.3-22b-lora-foley-v2a-1.0.safetensors` —
matches the dep's `filename` (backslash subfolder, same convention as the merged LoRA).
Raw source committed by the sync as `64d7de66`; the deletion of the old
`raw/ltx_v2v_foley_template.json` is STAGED and closes with the session commit.

## Phase 4 — op + descriptor

`flowLtxFoley` in all four: `commandRegistry.js`, `universal_workflows.js`,
`operationRegistry.js`, `operation_registry.json` (`universal: true`, `1.4.1`).
`ltx-foley` FlowDef with two declared controls and **no `uiComponent`**.

```
npm test  -> tests 592 | pass 592 | fail 0
eslint (6 changed files) -> exit 0
```

The suite gained `the LTX foley Flow carries its I/O titles (MPI-536)`.

## Phase 5 — renders and pays out (isolated app, own port 57906 + own profile)

1. `flow:open ltx-foley` mounts a 2-step carousel, no `uiComponent`.
2. Run slide renders both `textarea`s — `rows=3` empty (positive), `rows=2` pre-filled with
   the bench negative.
3. Payload with `state.s_installedModelIds` stripped before Generate (so `_run` persists but
   `submitFlowGeneration`'s availability guard aborts):

   ```json
   { "positive": "boots on gravel, distant traffic, a door creaking open",
     "negative": "music, melody, song, singing, vocals, score, soundtrack, beat, …" }
   ```

   No `injectionParams` — correct, this flow declares no `Input_*` control.
4. Engine `/queue` after: 0 running, 0 pending. Nothing was dispatched.
5. Reopening the flow restores both values.

The user's app on `:3000` was never touched; the isolated instance was killed by process
tree afterwards (`:57906` dead, `:3000` still 200).

## The decision this card owned

**v1 ships FOLEY MODE ONLY.** Voice mode has never been run, and the two are mutually
exclusive settings in one file — two toggles would present untested configuration as a
composable feature. The op declares no audio slot; `Input_Audio#106`,
`Input_Use_Input_Audio#108`, `Input_Use_Reference_Audio#122` and `Audio_Influence#110` stay
at their bench defaults. Recorded in the FlowDef comment and the flow doc.

## OPEN — CLOSED 2026-08-14, see LIVE RUN below

**The real generation was the user's gate** (add-flow playbook § live run), exactly as with
MPI-520. The graph itself is unchanged from the approved bench runs, but the app-side
dispatch has never produced a clip. Needs `ltx-23-balanced` installed — and now also the new
foley LoRA, which an existing LTX user gets as an incremental 216MB download.

Not in scope, carried forward: **no length cap** — long clips will OOM, and the ceiling has
not been measured on a target card (see the flow doc § Known ceiling).

## LIVE RUN - PASSED (Fabio, 2026-08-14, in his own app)

Ran end to end in the real app on his own clip. His verdict: *"it performed really well
when it comes to its actual function and the result that it gave me, so spot-on with what
I asked for. I did a very simple, basic prompt, and it is working great on that aspect."*

Screens confirm the whole path: `01 Inputs` accepts the project video, `02 Generate`
renders both declared controls with the bench negative pre-filled, Generate dispatches,
`LOADING MODEL 0% 0:22` then `ADDING FOLEY 1 38% 1:16` in the status bar with latent
previews arriving, VRAM 14.7/16 GiB at peak.

**This closes the card.** Everything MPI-536 owned is delivered and proven.

The UI gaps he found in the same session are NOT this card's - they are Flow-frame work
(MPI-531 items 2-4 territory) and a latent-preview consumer bug. Captured in the handoff
written the same day, not folded in here.
