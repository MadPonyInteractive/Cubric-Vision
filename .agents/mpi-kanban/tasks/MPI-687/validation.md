# MPI-687 validation

## Verified by agent (offline, bench python, ComfyUI 0.34.2)

Harness: import the pack with `PromptServer.instance` stubbed (routes.py registers
aiohttp routes at import and has no live server outside ComfyUI).

- Registers: `MpiH3ImageToVideo` -> "Mpi H3 Image To Video", category `MpiNodes/Utils`
- Inputs: required `clip, vae, prompt, width, height, length`; optional `first_frame, last_frame`
- Outputs: `("CONDITIONING", "LATENT")` named `("positive", "latent")`
- Delegation: every kwarg passed to `MiniMaxH3ImageToVideo.execute` exists on core's
  signature (`clip, vae, prompt, width, height, length, first_frame, last_frame`) —
  checked against `inspect.signature`, not assumed
- `doit` covers every declared input
- Blank detection: `None` -> blank, 1x1 loader sentinel -> blank,
  genuinely black 1216x704 frame -> NOT blank

## Outstanding — user judgement only

Wire it into `minimax_h3_fl2va` in place of the four-copy lattice and confirm the graph
behaves: t2va, first-frame only, last-frame only, first+last. Nothing an agent can settle
offline — it needs a real dispatch and the author's read of the result.

## Not done (deliberate)

- **Not pushed.** Node repo is 9 commits ahead of `origin/main` and a release is due but
  not being cut yet (user's call, 2026-09-04). This commit is `39c31ca`, local.
- **Pin not moved.** `dev_configs/node_lock.json` stays at `ccc25d1`. The node reaches the
  app only once pushed and pinned — until then the bench (symlinked) has it and the app
  engine does not.
- Bench not restarted; it was running on 8188 and is the user's session.

## Bench: r2va NON-TURBO arm measured (2026-09-04, AnimateDiff_00046)

Single-variable pair against `AnimateDiff_00042` — `diffprompt` confirms the ONLY node
difference is `444 Input_is_Turbo true -> false`. Same seed 684846897, same prompt, same
refs (`match` stage 1 / `max` refine), same 3-step sigmas (600).

| | turbo (00042) | non-turbo (00046) |
|---|---|---|
| wall | 158.26 s | 245.05 s (+55%) |
| stage 1 | — | 25 steps / 1:16, EasyCache 8/25 (1.47x) |
| refine | — | 3 steps / 1:23, EasyCache 0/3 |
| HF corr (grain) | 0.294 | **0.388** |
| bg/centre | 0.85 | **0.93** |
| centre lapE | 0.000493 | 0.000434 |
| decay200ms | -2.6 dB | -1.4 dB |
| quiet% | 18.5 | 15.9 |

Motion matched (|dI| 24.67 vs 24.46, cumulative 26.0 vs 20.2 px), so the grain
comparison is valid per the same-composition rule.

**User verdict: ships.** Background and city better; the footstep is now audibly a BARE
FOOT on wet stone. Cars absent, but the prompt never asked for them.

### EasyCache is non-turbo-ONLY, by construction — not a bug

Bench chain: `519 ModelAttentionBackend -> 520 EasyCache -> 523 (shift 2.0)`, while
`519 -> 521 (shift 4.0)` goes direct. `525 MpiIfElse` picks on 444. The log carries ZERO
`EasyCache enabled` lines across the whole 17:24-18:11 turbo block, confirming it.
So 8/25 is the first honest non-turbo number; the handoff's "expect 12-13/25" was measured
on a different branch state and is superseded. 0/25 would still mean broken wiring.

### The high-heels prior is ARM-DEPENDENT, not a model limitation

Previously written down as "a model prior, not a config fault — both arms, both LoRAs".
That is now WRONG. Same seed, same prompt, only 444 flipped: the turbo arm clicks heels,
the non-turbo arm gives a bare foot. The heel is a distillation artefact of the 8-step
turbo LoRA (or of shift_audio 4.0 — 444 switches model AND shift together, so the two are
confounded and this is one observation on one seed). Do NOT record it as a limitation.

### shift_audio 2.0 STANDS on the r2va non-turbo arm

`roomtone` ranked it worst of the three (decay200ms -1.4, quiet% 15.9) and I was about to
sweep 3.0 on it. The user's ears say the footstep is correct at 2.0. The metric loses —
same failure mode as `footband` ranking turbo above non-turbo while footsteps were
inaudible. No sweep. Per-arm values unchanged: turbo 4.0, non-turbo 2.0, refine 0.5.

## BUG 1's real mechanism — the two-pass halving, not a model cap

`adapt_canvas` was a red herring and so was `MAX_PIXELS`. Neither is ever applied to the
output latent; `MiniMaxH3ImageToVideo.execute` calls `_empty_av_latent(width, height,
length)` with no clamp at all, and `very_high` proves it by rendering 2.09 MP.

What shrank the canvas was OUR graph. Both H3 runtimes render stage 1 at half size and let
the latent upscaler double it back:

| node | expression | role |
|---|---|---|
| fl2va 509/510, r2va 620/621 | `floor(a / 64) * 32` | stage 1 = half, floored to /32 |
| fl2va 493/497, r2va 582/583 | `floor(floor(a/16)*16 * b / 32 + 0.5) * 32`, b=2 | stage 2 = stage 1 x 2 |

Composed, that is `floor(target / 64) * 64`. Any dimension not divisible by 64 lost 32px:
1376 -> 1344 (i2v_001) and 480 -> 448 (i2v_003's 448x448 square, which the handoff never
explained either). Six of 21 dimensions affected, including every axis of `low`, the tier
the shipped templates default to.

Fix: `floor(a / 32) * 16`. A /32-clean canvas halves to a /16-clean one, and /16 is all the
latent grid (`height // 16`) needs — the /32 floor was over-constraining stage 1 for no
reason. Every /64-clean canvas keeps the IDENTICAL stage-1 value, so the approved
`AnimateDiff_00046` ground truth (768x1344 -> 672/384) is untouched and nothing that already
worked moved. Verified by running both expressions through MpiNodes' own `safe_math` over
all 21 tier dimensions: 0 wrong, was 6.

Reverting 1376 -> 1344 in `ratios.js` still stands, but on different grounds: 768 is the
native short edge and 768x1344 is what `adapt_canvas` itself produces, so 1376 was an
invented number in the one tier whose job is to be in-distribution. The comment in that file
has been rewritten — it asserted MAX_PIXELS as the mechanism, which was wrong.

## BUG 2 — core stretches the anchor, so the wrapper conforms both frames

`comfy_extras/nodes_minimax_h3.py:142` resizes `first_frame` with `crop='disabled'` (a plain
stretch) while `:148` cover-crops `last_frame` with `'center'`. Core has no source-patch
mechanism, so `MpiH3ImageToVideo.doit` now cover-crops BOTH before delegating; core's own
resize is then handed an at-size image and becomes a no-op, keeping ONE resize in the
pipeline. Crop and not pad on the user's explicit call ("always crop, no padding, no
stretching") — letterbox bars baked into frame 0 get animated as scenery.

PROVEN with real torch and real `comfy.utils`, not a stub, and with a shape that actually
separates the two operations. A 200x200 square in a 768x1344 source, onto a 768x768 canvas:

    _cover_crop            -> 200 x 200   (square preserved)
    core's crop='disabled' -> 200 x 114   (squashed — the reported bug)

An earlier version of this check used a vertical band, which survives BOTH paths and would
have passed on a broken fix. The crop mode is now pinned by `h3.py`'s own self-check, since
a regression to `'disabled'` is invisible in the graph.

## What is verified and what still needs the user

Verified here: `h3.py` self-check green under the bench python (all sections); the crop
against real torch; both new expressions through the real `MpiMath` evaluator over every
tier dimension; `npm test` 883/883; both runtimes rebuilt from raw against the app engine on
48188 with an 8-line diff and nothing else drifted.

NOT verified here: an end-to-end generation. That needs the user's app, and the app must be
RESTARTED first — a `custom_nodes` dep installs at boot, so 1.2.10 is not in the running
engine.

## Bug 2 was a REGRESSION from the two-pass rebuild, not a longstanding bug

Found while sweeping the call sites. `docs/models/h3/README.md` carried a section titled
"The keyframe resize is the graph's job, and it is already done": MPI-452 had answered
core's stretch IN THE GRAPH, with `ImageResizeKJv2` nodes 218/220 (`keep_proportion:
crop`) in front of both frame paths, so core's resize was a no-op.

That answer did not survive its own rebuild. `git log -S ImageResizeKJv2 --
comfy_workflows/minimax_h3_fl2va.json` shows the nodes entering at `bb50b55e` (MPI-452)
and leaving at `6deb60b6` ("the H3 two-pass shape reaches the app", TODAY): the two-pass
port replaced the four-copy lattice with one `MpiH3ImageToVideo` and the resize nodes went
out with the lattice. The rebuilt fl2va has ZERO resize nodes -- `MpiLoadImageFromPath`
217/219 wire straight into the i2v node. So the squashed frame is one day old, introduced
by the same rebuild that shipped the two-pass, exactly like the halving bug.

Both of this session's bugs therefore come from the same event, which is worth remembering:
a graph rebuild silently drops whatever the old graph was carrying, and nothing fails.

The node-level fix is strictly better than restoring nodes 218/220: it cannot be dropped by
a re-export, and it applies wherever the node is used. Doc section rewritten to say so, with
an explicit "do not re-add graph resize nodes" (they would crop twice).

## Call-site sweep -- complete

Every graph carrying an H3 node was inventoried. Only `minimax_h3_fl2va.json` reaches an
i2v conditioning node, and it uses OUR wrapper (2x `MpiH3ImageToVideo`). `r2va` uses
`MpiH3References` (references are references -- user confirmed, no aspect conform wanted).
`flow_h3_extend` uses `MiniMaxH3AddGuide`, which already resizes with `"center"`
(nodes_minimax_h3.py:218) -- no bug there. `generate_h3.py:352` keeps core's raw
`MiniMaxH3ImageToVideo` in the FORBIDDEN set, so the generator refuses to ship a graph
containing it. No call site left stretching.
