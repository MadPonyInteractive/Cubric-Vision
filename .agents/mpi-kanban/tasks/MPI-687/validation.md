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
