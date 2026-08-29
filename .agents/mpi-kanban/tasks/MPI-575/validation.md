# MPI-575 Validation

**Verify mode:** user-ux — the deliverable is what a live preview looks like, so the
last step needs eyes on a running generation. Everything short of that is verified.

## Verified by this session

| check | command | result |
|---|---|---|
| Root cause, no GPU needed | source read of `ltxv_nodes.py:646` vs `:688` against `comfy/utils.py:1424` | announced `length` = latent frames; real ring = `(N-1)*8+1`. On Fabio's `fv/i2v_ms_004` (72 frames @24fps): announced **10**, streamed **73** |
| Card's stated root cause | same read | BOTH candidates disproven — `latent_shapes` has 2 entries for the AV pack, so KJ's slice is correct and `num_keyframes` is correct. Card description carries a CORRECTED banner |
| Our node resolves on the live engine | `GET :48188/object_info/MpiVideoSamplingPreview` | present, required `['model','vae','preview_rate']` — matches the rewired socket order exactly |
| Raw edit is what the converter produces | `workflow-to-api.mjs` on all three raw sources | **IDENTICAL** to the committed API graphs (52 / 55 / 134 nodes) |
| Runtime bake reproduces it | `orchestrate.py` | rebuilt `ltx_i2v_t2v.json` + `_int8.json`; `git status comfy_workflows/` came back empty |
| Injection contract | `validate-injection-rules.mjs` on the 4 LTX graphs | all 4 conform |
| Graph integrity after hand-surgery | scripted assertions per file | 0 dangling links, 0 missing link-table entries, 0 orphaned output refs, 0 remaining `LTX2SamplingPreviewOverride` |
| Both changesets survived the shared MpiNodes commit | `git show HEAD:` on `changelog.md`, `__init__.py`, `preview.py` | both changelog lines present, 3 `MpiBrushTrain` registrations, trim in `preview.py`. Independently confirms MPI-623's message, which was already `resolved` |
| Node pack compiles | `python -m py_compile` on the pack | OK |
| Lint | `eslint` on the two touched js files | clean |
| Curated pip set | `compile-node-deps.mjs --check` (node_lock was touched) | OK, no drift |

## NOT verified — the open question

Nobody has watched a real LTX generation since the change. It needs an **engine
restart first**: the installed `ComfyUI-MpiNodes` is still the old pin, and Python
does not reload a module in a running ComfyUI.

**The one question for Fabio:** on one LTX run, does the live preview loop the whole
clip continuously instead of flashing frame 0 and then the tail?

Fabio said "No more headaches, thank you" when ending the session. Read in context
that is probably the confirmation — it answers the headache he opened with — but he
had also said he would restart and test *and let me know when it's done*, and no such
message arrived. Closing the card on the ambiguity would be recording a run nobody
can point to, so the card stays in `doing`/`validating` with the question above.
One "yes" closes it.
