# Validation — MPI-703

**Released and pinned 2026-09-06**, on Fabio's explicit go-ahead for publishing the gated
MPI-699 commits. **Verdict: PASSED**, every step verified.

## What shipped as v1.2.11

| commit | card | what |
|---|---|---|
| `5319ed9` | MPI-699 | MpiWindowedSampler + MpiClearVramEnd |
| `e9e3633` | MPI-699 | windows cut on the model temporal grid, widgets in video frames |
| `b8bc9b3` | MPI-700 | MpiSaveVideo returns `video_path` |
| `ed4d289` | MPI-701 | MpiWindowedSampler slices the audio to its window |
| `287edb8` | MPI-703 | version bump to 1.2.11, next changelog header |

The two MPI-699 commits carried a standing "NOT cleared for publication" block from an
earlier handoff. `git push` sends the branch and not a commit, so the release could not
exclude them; Fabio cleared them explicitly before the push.

## Evidence

- **Pushed:** `8505769..287edb8  main -> main`
- **Registry workflow:** run `34047912369`, "Publish to Comfy registry", `completed success`
  in 40 s
- **Registry changelog:** `PUT .../nodes/ComfyUi-MpiNodes/versions/1.2.11` returned
  **HTTP 200**, response echoing all 6 V1.2.11 entries, `deprecated: false`
- **Pin:** `dev_configs/node_lock.json` `ComfyUI-MpiNodes.commit`
  `85057698…` → `287edb83f0de589984f59aa8fd4e92726087d7fb`, committed and pushed to Vision
  master as `ace2161e`

README needed no edit — the four feature commits had already synced it (`MpiWindowedSampler`
and `MpiClearVramEnd` rows present, `MpiSaveVideo` already documenting `video_path`; the
second `MpiClearVramEnd` hit is a cross-reference inside the `MpiSaveVideo` row, not a
duplicate).

## Gotcha worth keeping

The pin bump was first made by loading `node_lock.json`, editing, and re-serialising. That
round trip also rewrote the `_doc` field's `\uXXXX` escapes into literal (mojibake)
characters and appended a trailing newline the file never had — three changed lines for a
one-line edit. Redone as `git show HEAD:<file> | sed 's/<old sha>/<new sha>/'`, which gives
a genuine one-line diff. **Do not round-trip a JSON config through a parser to change one
value.**
