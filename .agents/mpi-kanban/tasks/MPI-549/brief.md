# MPI-549 - Tiled VAE decode for MiniMax H3 reference-to-video

## Symptom (Fabio, 2026-08-12, measured on a rented RunPod RTX 5090)

MiniMax H3 reference-to-video, three reference slots, Reference Detail = Max:

| Output | Result |
|---|---|
| 864x480 | completes, ~45s for 3s of video |
| 2K | OOM |
| 4K | OOM |

Card: RTX 5090, 32GB VRAM, 60GB system RAM.

Both failures surface as two toasts - "Ran out of memory processing this" followed
by "Remote engine disconnected - the Pod may have run out of memory and restarted"
- and need a reconnect from Settings before work continues. On a rented Pod that
is paid time lost, twice in one session.

## Cause

The decode runs directly on the full latent. There is no tiled decoding in the H3
workflows, so peak VRAM at decode scales with the full frame size and blows past
the card at 2K. Sampling is not the problem.

## Ask

Add tiled VAE decoding to the MiniMax H3 reference-to-video workflows.

Keep it simple: a single user-facing low-VRAM toggle. Do not expose tile size,
overlap or any other tuning to the user.

## Not in scope

- Tuning the tile parameters as user-facing settings.
- Other models' workflows - this card is H3 reference-to-video only. Widen it
  later if the same decode pattern shows up elsewhere.

## Open questions for whoever picks this up

- How much VRAM 2K and 4K actually need undecoded. Untested. Fabio's estimate is
  ~90GB, which would put it on an H100/A100-class card, but nobody has measured it.
- Whether Reference Detail = Match rather than Max already lets a 32GB card reach
  2K without any code change. Untested, and worth checking first because it may
  cost nothing.

## Origin

Found while producing the Cubric western film (Identity repo, MPI-74). That film
now generates every shot at 864x480 and upscales afterwards, which works, so this
card is not blocking it.
