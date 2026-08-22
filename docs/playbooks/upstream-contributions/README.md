# Contributing to a third-party node repo

When Vision needs a change in a custom-node pack we do not own. First case: a
LanPaint fork carrying LTX 2.5 support (MPI-601).

Related: `.claude/rules/comfy_engine.md` (the pin), `.claude/rules/git.md` (commits),
`docs/playbooks/add-model/` (the model wiring that motivates the change).

## Fork first. Always. Then PR.

A fork and a contribution are not alternatives — run both, in this order:

1. **Fork to `MadPonyInteractive/<pack>`**, keep the upstream licence unchanged.
2. **Pin the fork** in `dev_configs/node_lock.json` (`source: git-commit`, `repo`,
   `commit`, `filename`). Ship from it. The release is now unblocked.
3. **Open the PR upstream** with the same change.
4. **If it merges**, repin to upstream's commit and drop the fork. If it does not,
   nothing was ever waiting on it.

The fork is schedule insurance; the PR is the maintenance exit. Skipping step 1 and
waiting on a PR puts a third party on our release critical path.

## Attribution: the PR is Fabio's, not an agent's

Non-negotiable, and the reason this file exists.

An upstream PR is a **public record of who built the thing**. Vision's own commits
carry `Co-Authored-By: Claude` by house convention; an upstream contribution must
**not**.

- Agents may prepare the branch, write the code and draft the PR body.
- **Fabio pushes the branch and opens the PR from his own account.**
- No `Co-Authored-By` trailer, no "Generated with Claude Code" footer, no agent as
  commit author. Set `--author` explicitly if a branch was prepared in a session.
- Verify before handing over: `git log --format='%an <%ae>%n%b' <base>..HEAD` must
  show Fabio as author and no agent trailers.

If an agent has already committed with the wrong author, rewrite the branch before
it is pushed — not after.

## Licence hygiene

**Never copy third-party source into `ComfyUi-MpiNodes` or Cubric-Vision.** Most of
this ecosystem is GPL-3.0 (Impact Pack, UltimateSDUpscale, KJNodes,
Inpaint-CropAndStitch, LanPaint). Installing those as separate packs is what we
already do and carries nothing. Vendoring their code into a first-party repo makes
that repo a derivative of their licence, permanently.

A fork keeps the upstream licence sealed in its own repository. That is the whole
point of forking rather than porting.

Same rule when reading their code to understand it: clone or download to the
scratchpad, never into a repo working tree.

## What actually needs a code change upstream

Usually nothing. Check before assuming a fork is required — most packs branch on
ComfyUI's own `ModelType` enum rather than a hand-maintained model list, so a new
checkpoint of a known architecture needs parameter tuning, not code.

Worked example — LanPaint's whole model awareness is two booleans:

```python
IS_FLUX = self.inner_model.inner_model.model_type == ModelType.FLUX
```

Every FLUX or FLOW model is already handled. What genuinely needs code is a **novel
latent layout** — joint video+audio, an unusual VAE shape. That is why LTX 2.5 needs
a contribution and Chroma does not.
