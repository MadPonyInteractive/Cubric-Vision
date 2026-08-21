# MPI-574 — validation

## What was checked, and how

**1. Every migrated fact was grepped on disk BEFORE its memory copy was deleted.** 25 checks, all
`OK`, run as one command against the working tree — never "I wrote it" from memory:

| fact | landed in |
|---|---|
| clientLogger has no `.log`; 3rd arg is an error slot; poisons a fetch stub | `docs/utils.md` |
| custom node parked ≠ disabled | `.claude/rules/comfy_engine.md` (**was already there** — memory was a shadow) |
| ComfyUI WS events are client-addressed | `.claude/rules/comfy_engine.md` § 2 |
| never run `workflow-to-api.mjs` bare; `control_after_generate` law; `resolve-comfy-node.mjs` | `docs/workflow-authoring/converters.md` |
| the 3-check offline ladder; no validate-only endpoint | `docs/workflow-authoring/bench-editing.md` |
| download routes take FULL `DEPS`; `check-local` returns an ARRAY | `docs/download-manager.md` |
| headless import boundary; `CUBRIC_ENGINE_ROOT`; `CUBRIC_MODELS_ROOT`; spare-port router | `docs/testing-harnesses.md` |
| SeedVR2 top/mid verdict; shimmer root-cause; `denoise` quantisation; Pillow RGBA lanczos | `docs/models/seedvr2/README.md` |
| orphan sweep reaps by Pod NAME | `docs/runpod-remote-engine.md` § 4 |
| `approve --yes`; six release assets; supplied-audio envelope proof; `resolveDeps` union | **all four were ALREADY documented** — the memory files were duplicates |
| gallery preview probe | `docs/gallery.md` |
| grep the whole `logs/` dir for boot evidence | `docs/DEVELOPMENT.md` |

**2. Doc line budgets hold.** Every touched file re-counted after the edits; the three genuinely
long ones are on the existing exempt list in `docs/README.md`:

```
133 docs/README.md          196 docs/comfy.md         197 docs/testing.md
188 docs/testing-harnesses  198 docs/DEVELOPMENT.md   116 converters.md
118 bench-editing.md        135 models/seedvr2        127 releases/README.md
1051 download-manager.md (exempt)  591 runpod-remote-engine.md (exempt)
616 models/ltx/audio-input.md (exempt)
```

`docs/comfy.md` hit 201 on the first pass and the added paragraph was condensed to bring it back
to 196 rather than left over the line.

**3. Relative links resolve.** All 17 touched docs scanned; 0 broken. (One reported hit is my
regex catching the code snippet `INJECTORS[name](workflow, payload.injectionParams || {})` —
pre-existing prose, not a link.)

**4. Memory links resolve after the deletions.** 9 links pointed at deleted files; each was
repointed at the doc that now holds the fact, then re-scanned: **0 dangling markdown links, 0
dangling `[[wiki]]` links** across all 88 remaining files.

## A claim that was WRONG and got caught before it shipped

`docs/gallery.md`'s first draft carried the memory file's wording — *"frames land in a ring buffer
of 8"*. Checking the working tree before committing showed a peer session (MPI-571) mid-refactor
in `js/services/previewClipPlayer.js`, whose own docblock says **"8 is only the fallback"** and the
ring is sized by the clip's announced `length`. The claim was true when the memory note was written
and is not true now — exactly the rot this card exists to stop, arriving inside the card itself.

Fixed before the commit: the buffer semantics were cut and delegated to `docs/preview-bus.md`
(which MPI-571 owns and is actively updating), and the API signature was corrected against the
real code — `_cardMap` is keyed by **group id** despite `el.updatePreview`'s `tempId` parameter
name, so the probe uses `getCardByGroupId(gid)` and the card-level 2-arg form.

## Peer isolation

A peer session held unstaged work in this tree throughout (`MpiGalleryGrid.js`, `MpiBaseFlow.js`,
`previewClipPlayer.js`, `tests/previewClipPlayer.test.cjs`, MPI-571's card files).

- The docs commit (`2c57098b`) used `git commit --only` with an explicit 16-path pathspec, none of
  which the peer owns per their `files.json`.
- `board.json` and `events.jsonl` are the **interleaved** co-owned case — my card insert and their
  MPI-571 `todo → doing` move land in the same hunk, so no hunk filter separates them. Followed
  `.claude/rules/git.md` § "build the blob instead": reconstructed both from `HEAD`, applied only
  my change **textually** (never `json.dumps`, which would reformat the file), asserted the peer's
  markers were absent from my blob (`MPI-571` still in `todo`, not `doing`; 3 peer event lines
  excluded), then `hash-object` + `update-index`.
- Verified before committing: `git diff --cached --name-status` listed only my 5 paths, and
  `git diff --cached | grep -c MPI-571` returned **0**.

## Not verified / left open

- **No app was run and no test suite executed.** This card changed only markdown and the agent's
  own memory — no product code, so `npm test` has nothing new to bite on. Stated rather than
  implied.
- **Whether the split is the one Fabio wants is a judgement call, not a check.** Card stays in
  `doing` / `validating` for that reason: the mechanical work is proven, the editorial call is his.
  The reversible part is cheap — every deletion is recorded row-by-row in the was→now table in
  `memory/procedures-index.md`, and the doc text is in commit `2c57098b`.
