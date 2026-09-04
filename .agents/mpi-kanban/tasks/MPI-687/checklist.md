# MPI-687 checklist

- [x] Read the sibling procedure — `.claude/skills/mpi-node/SKILL.md` routes new-node to
      `.claude/commands/new-node.md` (the skill is newer than the command file and is the
      entry point; the command file remains the source of truth for the steps)
- [x] Drift check on `ComfyUi-MpiNodes`: working tree clean, HEAD 9 commits AHEAD of
      `origin/main`, app pin at `origin/main` (`ccc25d1`)
- [x] Stale claim on `h3.py` superseded — owner session `ef56856f` (MPI-591) is
      `"status": "closed"`, heartbeat 2026-08-31
- [x] `MpiH3ImageToVideo` added to `h3.py`, beside `MpiH3References` whose pattern it mirrors
- [x] Registered in `__init__.py` — import, `NODE_CLASS_MAPPINGS`, `NODE_DISPLAY_NAME_MAPPINGS`
- [x] `README.md` row added
- [x] `changelog.md` bullet added under the bottom-most version header (no version bump —
      that is `/release`)
- [x] Smoke-tested offline: registration, input/output shape, delegation kwargs checked
      against core's real signature, blank detection on all three cases
- [x] Committed in the node repo — `39c31ca`, explicit pathspec
- [ ] **Pushed** — deliberately not done, release pending (user, 2026-09-04)
- [ ] **Pin moved** in `dev_configs/node_lock.json` — blocked on the push
- [ ] Workflow rewired to drop the boolean lattice — user
- [ ] Second conditioning at upscaled dims wired for the latent-upscaler refine — user

No `class_type` was removed or renamed, so no `comfy_workflows/` grep was required.
