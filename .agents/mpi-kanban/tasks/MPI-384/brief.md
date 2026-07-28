# MPI-384 Brief — Text masking (SAM3 open vocabulary)

Raised by the user 2026-07-29 while verifying MPI-380, and proven by them live in the
ComfyUI node graph before carding.

---

## Why this exists

The Points tool (MPI-380) works and is precise, but it needs MORE points than expected
— especially NEGATIVE ones — or SAM3 over-selects. Its weak spot is thin, strappy
subjects: a bikini, a purse, a strap. A face can take six dots.

Naming the object fixes exactly that. The user ran SAM3's text path on the same class of
image with `bikini:2` and `individual_masks: true` and got two clean per-object masks,
including the thin side-straps that points fought with.

**This is not a revival of the cancelled MPI-361 Phase B.** That was killed as a *hover
enumerator*, and that verdict stands: 4 categories cost 10.5s, so SAM3 can never drive
hover-to-discover — MPI-379 keeps YOLO for that. A deliberate "type it, press Detect,
pick a chip" tool is a different job, and ~3.6s on an explicit press is fine.

---

## Shape (user's own description)

A text box, an input for how many to find, Detect, then the **existing chips** — the
user clicks the chip they want. Nothing new is needed for the chip strip; it already
takes one mask per pick.

Decided with the user: this is the **4th rail tool**, a sibling of Brush / Points /
Detect — not a mode bolted inside Detect. One job each. (Shapes, MPI-368, becomes the
5th.)

---

## What is already in place

MPI-380 did most of the plumbing groundwork without meaning to:

- `CheckpointLoaderSimple` for `sam3.1_multiplex_fp16.safetensors` is already in the
  graph, and **its CLIP output is unwired and free**. SAM3 ships its own CLIP through
  `comfy/text_encoders/sam3_clip.py`, which is what parses the prompt.
- The weight is in R2 and declared as an `engineAsset`.
- MPI-381's tool split makes a new rail entry a one-line registry addition.
- The picker/thumb/Add/Subtract chain is shared and already mode-agnostic.

So the new work is: `CLIPTextEncode` -> `SAM3_Detect.conditioning`, a branch selector,
one organism, one injection param.

---

## Traps (measured / read from source, not guessed)

1. **`name:N` is MANDATORY.** `_parse_prompts` in `comfy/text_encoders/sam3_clip.py`
   comma-splits categories and reads `name:N` as that category's cap. A bare `bikini`
   silently returns **ONE** detection. The UI's count input IS that N — so the injected
   string must always be built as `name:N`, never the bare word.
2. **Text and box are mutually exclusive.** In `SAM3_Detect.execute` the box branch is
   gated `if b_boxes is not None and not has_text`. With text present, boxes become a
   constraint on the detector instead of a segment-this-box instruction.
3. **`individual_masks: true`** is what yields one mask per object. Left false, SAM3
   unions everything into a single mask and the chips collapse to one.
4. **Do NOT hang the text param on an `MpiString` node.** `MpiString` is in
   `comfyController`'s `PATH_MEDIA_CLASSES`, so any param aimed at one is treated as
   MEDIA and pushed through `_resolveMediaPath` / `_uploadRemoteMedia` — it breaks the
   REMOTE engine while local passes. MPI-380 hit this exact bug. Use **`MpiText`**.
5. **Nothing in the graph gates an empty prompt.** Gate it app-side, the way the points
   tool gates zero points.
6. **The converter has blast radius.** Always
   `node scripts/workflow-to-api.mjs comfy_workflows/raw/img_auto_mask.json` with the
   explicit path; with no arguments it re-emits all 31 workflows and writes 15 stray
   template files.

Carried from the family contract: a mask tool never swaps the viewer surface; a tool
swap must not clear the mask; leaving a tool must call `setMaskPointsMode(false)`; any
tool that makes a mask outside a brush stroke must emit `mask-ready` or call
`viewer.el.evaluateMask()` or the op strip never unlocks; every rail mask tool must be
in `_MASK_TOOLS` **and** `TOOL_OPTIONS_REGISTRY` (`tests/mask-tool-registry.test.cjs`
guards both, and a miss is otherwise silent).

---

## Downstream note

The MPI-380 brief already flagged that SAM3 detects **`head`** from plain text cleanly —
a class no detector we ship has (`face_yolov8n` gives a face box, not the skull/hair
silhouette). Head Swap (MPI-259 / MPI-306) currently approximates one. Once this tool
exists, `head:N` is just a string. Not in scope; flagged so it is not rediscovered.
