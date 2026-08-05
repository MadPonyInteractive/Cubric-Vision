# MPI-452 Brief - wire MiniMax H3 as a model

## BLOCKED - do not start

MPI-451 (licence gate) must land first. Our H3 authorization is granted "subject to and
conditioned upon continued compliance" with commitments we made, one of which is binding each
end user to the licence's restrictions before they receive the weights. Shipping H3 without
that gate breaches the condition the grant rests on.

Second open question, tracked here because it can change the product outcome: the
authorization names **us**, and it is not settled whether it reaches end users who are
themselves in an excluded territory. Get that in writing before release. If it does not
reach them, MPI-451's route-to-the-licensor's-own-form design is what makes the release
viable - each user carries their own authorization.

**Asking that question is the suggested first step on MPI-451**, not on this card - the
answer changes what MPI-451 builds, and a draft is ready in the private folder named below.
Do not wait on it here; MPI-451 landing is what unblocks this card either way.

Licence detail is held OUTSIDE this repo (public repo + confidentiality undertaking):
`C:/AI/Mpi/_private/minimax-h3-licence/`.

## What the work is

Run `/mpi-add-model` - `docs/playbooks/add-model/` is the playbook and holds the traps. On top
of the standard path, H3 specifics:

- **Engine bump off the 0.29.2 pin.** H3 needs core >= 0.30.0. The bench is already on 0.30.2
  and clean across all 20 custom-node packs (see MPI-449). Still run the node-floor pairing
  check before picking the tag - `.claude/rules/comfy_engine.md`.
- **Two DiTs, not interchangeable.** `fl2va` covers T2V + first/last-frame I2V;
  `ref2va` covers omni-reference (<=9 images, <=3 videos, <=3 audio). Different nodes,
  different files.
- **Audio is not optional.** One sampler pass emits a joint video+audio latent that feeds
  BOTH `VAEDecode` and `VAEDecodeAudio`. Vision already ships audio for LTX - see
  `docs/models/ltx/audio-input.md` and the `Input_Use_Input_Audio` gate pattern.
- **Frame count is constrained**: `n % 17 == 5` at 24fps. Canvas 768 short edge, 768x1344
  cap, axes multiple of 32.
- **Deps point at the publisher's repo, never R2.** `downloadManager` already supports an
  arbitrary `url` + `noMirror`; 65 existing deps do this. Re-hosting would put us squarely
  inside the licence's distribution provisions for no benefit.

## Related

- MPI-449 - bench research: weight matrix, chosen variant, feasibility numbers
- MPI-451 - the licence gate that blocks this
