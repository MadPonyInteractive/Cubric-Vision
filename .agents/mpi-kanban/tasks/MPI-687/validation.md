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
