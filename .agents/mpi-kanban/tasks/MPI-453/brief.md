# MPI-453 — an uninstalled operation is still dispatchable, and its rejection opens the bug reporter

Found live 2026-08-05 by the user, mid-MPI-450. **Release blocker for 1.4**, added to
that umbrella's Gate A.

## What he saw

Wan 2.2 selected, no image staged, pressed generate. Instead of a toast, the
**"Generation failed / Prompt outputs failed validation"** dialog with a
**REPORT ON GITHUB** button. His read — *"I forgot to put an image on Wan"* — is the
natural one and it is not what happened.

## What actually happened

`%APPDATA%/Cubric Vision/logs/app.log`, 2026-08-05T06:05:07:

```
[ERROR] Failed to validate prompt for output 932:
[ERROR] * UNETLoader 95:
[ERROR]   - Value not in list: unet_name: 'Wan_22_t2v_High.safetensors' not in
          ['Chroma1-HD-…', 'Wan_22_i2v_High.safetensors', 'Wan_22_i2v_Low.safetensors',
           'boogu_image_edit_turbo…', 'flux-2-klein-4b…', 'krea2_raw…',
           'lustify-v10-krea-raw…', 'qwen_image_edit_2511…']
[ERROR] * UNETLoader 96:
[ERROR]   - Value not in list: unet_name: 'Wan_22_t2v_Low.safetensors' not in [...]
[WARNING] invalid prompt: {'type': 'prompt_outputs_failed_validation', 'message':
          'Prompt outputs failed validation', 'details': '', 'extra_info': {}}
[ERROR] [comfy] Workflow failed: t2v_ms / wan-22 — Error: Prompt outputs failed validation
```

He has **only the i2v weights installed**. With no image staged the app chose `t2v_ms`,
whose graph loads a weight pair that is not on disk. Nothing to do with the missing
image — the same failure would happen with an image if he picked t2v.

## Root cause — availability, not the error dialog

`js/data/modelConstants/models.js` gives `wan-22` **per-operation** deps:

```js
supportedOps: ['t2v_ms', 'i2v_ms'],
operations: {
    t2v_ms: { deps: ['wan-22-t2v-high', 'wan-22-t2v-low'] },
    i2v_ms: { deps: [ … its own three … ] },
}
```

Those are opt-in per model (MPI-122's op draft), so **the app knows the t2v weights are
absent** — and offered the operation anyway.

The predicate already exists and is already correct:
`deriveInstalledOps()` at [`resolveModelDeps.js:495`](../../../js/data/modelConstants/resolveModelDeps.js),
which `MpiModelManager` uses to render exactly this ("which ops are installed"). The
PromptBox op strip simply never consults it. And the hook for the fix is already in
place — [`MpiPromptBox.js:1251`](../../../js/components/Organisms/MpiPromptBox/MpiPromptBox.js)
returns a disable REASON:

```js
if (cmd.requiresMask && !_context.hasMask) return 'paint a mask first';
```

A sibling clause is the shape of the answer. Prefer routing the user to install the
operation over a bare refusal.

**Blast radius is bounded but the gate is not model-specific.** Measured over `MODELS`:
`wan-22` is the *only* model today with more than one operation carrying its own
weights. Fix the mechanism anyway — the next multi-weight model must inherit it, not
re-discover this.

## Second defect — the error surface

Even with the gate, a validation rejection must never open `MpiErrorDialog`.
`.claude/rules/dos_and_donts.md`: *"`ui:error` → MpiErrorDialog (GitHub-report dialog) —
reserve for genuine reportable bugs, never expected transient states."* A weight the
user chose not to install is not a bug in the app, and that dialog invites a junk issue.

**The pattern already exists — extend it, do not invent one.** MPI-229 turned the
missing-LoRA case into a warning toast: `_findNodeErrorLora` in
[`comfyController.js`](../../../js/services/comfyController.js) reads
`node_errors[id].errors[].extra_info.received_value`, precisely because the top-level
`error.details` is `''` whenever some *other* output still validated — which is exactly
what this log shows. It handles both carriers (local 400 `node_errors`, remote
`detail.comfy_body`). `unet_name` needs the same, and while in there `ckpt_name`,
`vae_name` and `clip_name` are the same class.

The surfaced message should name the file. "Prompt outputs failed validation" tells the
user nothing; `Wan_22_t2v_High.safetensors` tells them everything.

## Do not

- Do **not** widen the dialog copy or add a special case at the throw site. That is the
  symptom, and the root is one layer up.
- Do **not** make the install pull both weight pairs — the per-op opt-in is deliberate
  (these are multi-GB pairs) and removing the choice to dodge a UI gate is backwards.

## Verify

1. Wan 2.2 with only i2v installed: **t2v is visibly unavailable**, with a reason, and
   pressing generate cannot dispatch it.
2. A test replays the **real** 400 body transcribed above (per
   `.claude/rules/dos_and_donts.md` § Tests — replay the shape production delivers) and
   asserts a toast-class error, not a reportable one. Prove it bites against the
   unfixed code.
3. Both engines: the local carrier is `node_errors`, the remote one is
   `detail.comfy_body`. MPI-229 shipped this bug once by fixing only one of them.
