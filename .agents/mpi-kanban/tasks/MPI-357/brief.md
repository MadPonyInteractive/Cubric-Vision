# MPI-357 — Gated models: licence-verified install

**Does NOT block MPI-354.** Klein 4B is Apache-2.0 and ships with none of this.
This card exists so the models we currently refuse become reachable later.

## Why

Users are migrating from Qwen to FLUX.2 Klein 9B (faster, better). Many already
own 9B LoRAs. If the model is absent from our library those users bounce — and
their LoRAs cannot be rescued by shipping 4B instead, because **4B and 9B LoRAs
are not interchangeable** (different dims). 4B's value is speed and object
removal, not headline quality.

Blocking it today is the licence. This card removes that block properly instead
of ignoring it.

## What the licence actually says (FLUX Non-Commercial Licence v2.1, read 2026-07-26)

Verified against the real text at
`https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/blob/main/LICENSE.md`:

- **Outputs are commercially usable.** "You may use Output for any purpose
  (including for commercial purposes)" — only bar is training a competing model.
  So our users selling their generations was never the problem.
- **Redistribution IS permitted** (section 3), on conditions: pass a copy of the
  licence to recipients, display the Attribution Notice prominently, and state
  modifications for any derivative. Recipients receive their rights *directly
  from Black Forest Labs*, not sublicensed through us.
- **Prohibited** is *use* that is revenue-generating, or "in direct interactions
  with or that has impact on end users", or training/distilling for commercial use.

The mechanism that fits: the licence relationship is **user to BFL**, established
at the source, with the user's own account. We are a distributor operating under
section 3, not a sublicensor. That is what the verification gate encodes.

## Design (user's spec, 2026-07-26)

1. Model tile shows a **badge** — needs licence verification — in place of Install.
2. **Sidebar button** starts verification: open the model's licence page at the
   source, user accepts the terms under their own account, user supplies an HF
   access token.
3. **We prove it.** An authenticated probe of the gated repo with that token
   returns 200 if the terms were accepted, 403 if not. Store the verified flag +
   timestamp. A self-declared checkbox is worthless as evidence — do not build one.
4. **Unlock the normal install.** Weights still come from **our R2**, so download
   speed, resume, hashing, and install-state are the existing paths.
5. Weights ship with the **licence copy + Attribution Notice** (section 3).

### Why R2 delivery beats direct-from-HF here

The obvious alternative — stream direct from HF with the user's token — forces the
token onto the **Pod** as well, because the remote engine downloads its own weights.
Keeping R2 as the delivery path means **the Pod path needs no changes at all**: HF
is the licence oracle, R2 stays the CDN. That is a real simplification, not a
compromise.

## Plumbing notes (grounded, not guessed)

- Local downloads are a plain node stream — `routes/downloadManager.js` around the
  `content-length` read. No auth header needed if R2 stays the source.
- Pod-side fetch is `aria2c` in `wrapper/wrapper.py` (mpi-ci/cubric-vision-pod).
  Unchanged under this design.
- Install-state display rules live in `docs/model-library.md`; the badge is a new
  state alongside the existing install states.
- Bearer-header helpers already exist for RunPod (`routes/remoteHeaders.js`) if a
  token ever does need forwarding.

## Scope

Generic over **any** gated dep, not Klein-specific. Known consumers:

| model | licence | status |
|---|---|---|
| FLUX.2 Klein 9B | FLUX NCL v2.1 | first consumer, unlocks the refcontrol pose/canny/lineart/normal LoRA set |
| Flux.1 Fill dev | flux-dev non-commercial | previously refused (MPI-323) |
| FLUX.2-dev Fun ControlNet Union | flux-dev non-commercial | the only real FLUX.2 ControlNet; blocked today |

## Open questions

- Where does the token live? Needs to survive restarts without landing in
  `project.json` or any file we might ship or log.
- Does verified state travel with the app or the machine? A portable build moved
  to another PC should probably re-verify.
- Do we re-probe periodically, or only on 403 at download time? Lazy answer is
  on-403, and it is probably right.
