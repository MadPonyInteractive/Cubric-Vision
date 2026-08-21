# MPI-536 — LTX 2.3 Foley Flow

Wire the bench-proven full-clip V2V foley graph into the app as a **Flow**. Member of
umbrella **MPI-552**; second in its order after MPI-520 (extend). The authoring shape is
already settled — copy `docs/playbooks/add-flow/existing-flows/ltx-extend.md`, do not
re-derive it.

**Verify mode:** auto (the real generation is the user's own gate, as with MPI-520)

## Current State

**All six phases landed 2026-08-14** in one session; card is `doing` / `validating`. Evidence
per phase is in `validation.md`; the flow's own doc is
`docs/playbooks/add-flow/existing-flows/ltx-foley.md`.

**The single open item is the user's live generation** — the add-flow playbook puts the real
run with the user, and the app-side dispatch has never produced a clip. Everything else is
verified: R2 HEAD 200 at the exact byte length, the dep resolving on `ltx-23-balanced` and not
on `ltx-23`, injection-rules gate clean, 592/592 tests, and the payload read out of a live
isolated app with nothing queued.

Two things a fresh session would not guess:

- The sync committed the NEW raw file (`64d7de66`) but left the DELETION of
  `raw/ltx_v2v_foley_template.json` staged. It closes with the session commit — do not
  re-run the sync to "fix" it.
- `validate_board.py` fails on this repo right now, entirely on **other** cards: MPI-557's
  event lines (peer session, do not touch) and MPI-520 missing a `checklist.md`. Nothing
  MPI-536 wrote is implicated.

## Prereq findings (2026-08-14)

- `Foley_Lora#100` loads `ltx-2.3\ltx-2.3-22b-lora-foley-v2a-1.0.safetensors` — **not a dep
  today.** Local file: `226,709,270 B` (216.21MB), sha256
  `1bc16020f3937f1dc4957b24c713bc04ec550d6502db8c3e1dd822c412e1fb85`.
- **No public mirror exists.** The official repo `Lightricks/LTX-2.3-22b-LoRA-Foley-V2A` is
  GATED (`X-Error-Code: GatedRepo`, 401 anonymous). Comfy-Org's `split_files/loras` carries
  ingredients / celebvhq / talkvid but NOT foley. `FuzzPuppy/LTX-2.3-Foley-LoRA` is a
  DIFFERENT community LoRA (`ltx-2.3-foley-400-steps.safetensors`), not a mirror of this
  file — do not wire it as one. → the dep ships with **no `mirrorUrl`**, R2 only.
- The graph's second LoRA (`talk3_ID_Lora#119`) is already dep `ltx23-lora-talkvid`. No work.
- Licence: LTX-2 community licence, same as the LTX 2.3 base weights we already redistribute
  on R2. No `licences.js` gate exists for LTX and none is added here.

## Decisions

- **Dep goes on `ltx-23-balanced` ONLY, not both tiers.** The proven graph's `UNETLoader`
  bakes `int8_convrot`, so the High card cannot run this Flow; putting the weight on both
  tiers costs High users 216MB they can never use. (`ltx23-lora-talkvid` sits on both only
  because the SHIPPED t2v/i2v graphs load it on both.)
- **v1 ships FOLEY MODE ONLY.** Voice mode has never been run — untested configuration, and
  the two are mutually exclusive settings in one file that must not look composable.
  `Input_Audio#106`, `Input_Use_Input_Audio#108`, `Input_Use_Reference_Audio#122` and
  `Audio_Influence#110` stay unexposed at their bench defaults. This is the product decision
  the card owns; recorded here and in `brief.md`.
- **Controls: positive + negative text only.** No resolution (deleted from this graph on
  purpose — the delivered pixels are the source's), no duration (whole-clip by construction),
  no seed (`_buildParams` fills `Input_Seed`). `Input_Lora_1..6` stay `None` — user LoRA slots
  are a model-op surface, not a Flow one.

## Phase 1: Stage the weight

Upload to `cubric-r2:cubric-models/vision/models/loras/ltx-2.3/`, serialized, `--bwlimit 3M`,
log to a file (not a TTY progress bar). Verify `rclone lsf` + a public HEAD returning 200 with
`content-length: 226709270`.

**Verify:** HEAD 200 + exact byte length on `https://models.cubric.studio/vision/models/loras/ltx-2.3/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors`

## Phase 2: Dep entry

`ltx23-lora-foley` in `loraDeps.js` (filename `loras/ltx-2.3/…`, forward slashes; URL derived
from filename; no `mirrorUrl`), added to `ltx-23-balanced.dependencies` in `models.js`.
`footprint.js` computes from DEPS, so nothing to edit there.

**Verify:** `node --check` on both files; the dep resolves through `resolveDeps` for
`ltx-23-balanced` and NOT for `ltx-23`.

## Phase 3: Workflow sync

Rename `raw/ltx_v2v_foley_template.json` → `raw/flow_ltx_foley.json` (a bare name converts to a
direct runtime file; `_template` routes to a generator that does not exist for Flows). Convert
against the APP engine on **48188**, never the 8188 bench. Injection-rules gate clean.

**Verify:** `validate-injection-rules.mjs` clean; API JSON has 53 nodes; 0 missing-required, 0 dangling.

## Phase 4: Op + descriptor

Op `flowLtxFoley` in the 4 files (`commandRegistry.js`, `universal_workflows.js`,
`operationRegistry.js`, `operation_registry.json` — hand-maintained superset, never
regenerated). `FlowDef` `ltx-foley` in `flowsRegistry.js`: `requiredModels:
['ltx-23-balanced']`, one video slot → `Input_Video`, `mediaType: 'video'`, declared
`controls`, **no `uiComponent`**.

**Verify:** new case in `tests/inject-params-titles.test.cjs` pinning `input_video`,
`input_positive`, `input_negative`, `input_seed`, `output_video`; `npm test` green; eslint clean.

## Phase 5: Prove it renders and pays out

Isolated app (own port + own profile, never `:3000`). Controls render on the run slide;
strip `state.s_installedModelIds` before Generate so `_run` persists the payload without
dispatching; read `state.s_flowInputs`. Reopen restores.

**Verify:** payload shows `positive`/`negative`; reopen restores both.

## Phase 6: Docs

`docs/playbooks/add-flow/existing-flows/ltx-foley.md` — shape, the two decisions above, and
the explicit "opposite of extend" note on resolution. Hub checklist untouched unless the
foley wiring taught it something new.

## Completed

Phases 1–6, 2026-08-14. Weight on R2 → dep on `ltx-23-balanced` only → workflow renamed and
synced against 48188 → `flowLtxFoley` + the `ltx-foley` FlowDef → payload proven live →
`existing-flows/ltx-foley.md`.

## Remaining Work

- The user's live generation (the playbook's own gate).
- **No length cap.** Long clips will OOM and the ceiling has not been measured on a target
  card. Not scoped here; the flow doc records it under § Known ceiling.

## Plan Drift

**2026-08-14 — `brief.md` was wrong about deps.** It states "no `dependencies.js` entry — it
runs on the already-wired LTX 2.3 checkpoint". `Foley_Lora#100` disproves it. `task.json`
already carried the correction; the brief was corrected in place during phase 2.

**2026-08-14 — the plan expected a mirror decision; there was no decision to make.** The
umbrella's sequencing note assumed the foley LoRA would mirror like `ltx23-lora-talkvid`
does. It cannot: the only upstream copy is gated. That is why this dep is the first LTX one
with no `mirrorUrl`, and why MPI-538 should check `Lightricks/LTX-2.3-22b-IC-LoRA-DubIt`'s
gate BEFORE planning one.
