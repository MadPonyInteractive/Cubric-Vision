# MPI-614 — a cross-tier LoRA binds NOTHING and the run still reports success

Caught live 2026-08-23 while Fabio validated MPI-610, and it immediately cost the misreading
it will always cost: the sheet came back unchanged, which reads as *"the rack is not wired"*.

## What happened, with the evidence

A Character Sheet run picked a Klein **9B** style LoRA for a phase running the Klein **4B**
transformer. Read back out of `/history` on the app engine (48188):

```
Input_Lora_Phase2_1   flux2-klein\styles\9b\Chibi.safetensors     strength_model=1
Input_Edit_Model      flux-2-klein-4b-int8-convrot.safetensors
```

The engine log for that prompt is a wall of, one pair per block:

```
ERROR lora diffusion_model.single_blocks.7.linear1.weight  shape '[27648, 3072]' is invalid for input of size 150994944
ERROR lora diffusion_model.single_blocks.7.linear2.weight  shape '[3072, 12288]'  is invalid for input of size 67108864
```

**Every key was rejected** — 4B is rank 3072, 9B is 4096 (`docs/models/klein/9b.md`; the rank
dims are also how you tell the two files apart). And then:

```
status: "success"   completed: true   messages: execution_start, execution_cached, execution_success
outputs: 2
```

So: a full generation, two images, zero LoRA applied, no toast, no error, nothing in the UI
that says the thing the user selected did not happen.

## Why the picker offered it at all

Nothing filters a Klein LoRA list by size tier. Both Klein cards carry
`loraStrengths: ['model']` and **no `loraFolder`** (verified 2026-08-23), so the rack lists
whatever is in the Klein LoRA folder — and `styles/4b/` and `styles/9b/` sit side by side in
it. The eight `klein-style-*` DEPS the app ships are all `loras/flux2-klein/styles/4b/`; the
9B file was on disk from the MPI-598 work. Any user who ends up with both sizes hits this.

**Pre-existing, not introduced by MPI-610** — the same picker feeds the prompt box, so a
Klein *model* generation has always been able to do this. MPI-610 made it far easier to reach
by giving a Flow a second, Klein-side rack whose default arm is 4B while the sibling flow
`scribble-object` recommends 9B.

## Two separate defects, and the second is the bigger one

1. **The picker offers a weight the running model cannot load.** Fixable by filtering the
   list to the running model's tier — `sizeTierLetter`/the dep folder convention already
   encode which is which, and `loraFolder` exists as a field for exactly this.
2. **A LoRA that binds NOTHING is not surfaced anywhere.** This is the part that generalises
   beyond Klein: ComfyUI treats unmatched LoRA keys as warnings and finishes green, so
   *any* mismatched LoRA on *any* model is silent today. There is already a missing-LoRA
   guard that turns a ComfyUI `value_not_in_list` into a real toast
   (`js/services/comfyController.js`, `lora_missing_*` error codes) — this is the same class
   of failure one step later, and it has no equivalent. Worth deciding whether the fix is
   detection at dispatch (compare tiers before sending) or after the fact (read the run's
   log for `ERROR lora ... shape ... is invalid` and toast).

Prefer 1 **and** 2: filtering stops the common case, but only 2 catches a genuinely corrupt
or foreign LoRA the user dropped in themselves.

## How to reproduce

Put any `flux2-klein/styles/9b/*.safetensors` on disk, open Model Settings for **klein-4b**,
select it into a slot, run anything on Klein 4B. Then:

```bash
node scripts/../  # or read it directly:
curl -s http://127.0.0.1:48188/internal/logs/raw | grep -i "ERROR lora"
```

The `/history` read that proves what the graph actually received is worth keeping as a
technique — a scratch script for it was written during MPI-610 and the recipe is: `GET
/history` (OLDEST FIRST), take the newest entry whose `prompt[2]` carries the titles you care
about, and read `inputs.lora_name` off each rack node.

## Related

- **MPI-610** — the session this was found in; its `validation.md` records the run.
- **MPI-613** — the cogwheel placement change from the same test session. Independent, but it
  moves the control the user reaches this panel through.
- `docs/models/klein/9b.md` — the 4B/9B rank difference, and why the two LoRA sets are not
  interchangeable.
- `js/data/modelConstants/loraDeps.js` — the `klein-style-*` and `klein-9b-lora-*` entries.
