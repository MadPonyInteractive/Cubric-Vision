# MPI-385 Checklist

Derived from `brief.md` (this card is a queue, so the queue IS the checklist).
Order matters: item 1 gates everything below it.

- [ ] Connect once to the Pod (dev channel runtime, port 3000 free)
- [x] MPI-380 - newly-added `engineAsset` reaches the REMOTE install path
      **ANSWERED FROM CODE, NEGATIVE — it does not, and no Pod was spent finding out.**
      An engineAsset in no model's dep list has no route to a Pod: the remote path
      installs per-MODEL deps only, and the image bakes engineAssets but not sam3.
      Proof chain on MPI-380's validation.md. **Blocks the two items below.**
      **FIX SHIPPED + locally verified** (suite 280/280, negative-controlled both
      ways, lockstep guard passes against the real Dockerfile). Item 1 is now a real
      test: does the wrapper accept a `checkpoints/` install and does ComfyUI then
      resolve the weight. Expect 3 assets to install on connect (1.76GB) and 6 to skip.
- [ ] MPI-380 - points -> Detect -> mask back, and NO points PNG in staging
- [ ] MPI-384 - SAM3 text -> chips, prompt arrives as TEXT not a media path
- [ ] MPI-346 - `.mpi_node_commit` drift ladder reinstalls the node on connect
- [ ] MPI-328 - watch the boot log for `models/status short answer`, no false installed flip
- [ ] MPI-135 - DC-steer (cardless; check, or card it properly if it needs real work)
- [ ] Findings written to each MEMBER card's `validation.md`, not this one
- [ ] Tear down the Pod once at the end
