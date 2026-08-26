# MPI-596 — the baked prompts

> One instruction per mode. The mode is the **Auto/Manual** toggle at stage 2 (Auto default),
> and it switches the reference configuration as well as the prompt — see
> [brief.md](brief.md) § The shape.
>
> **Klein 9B only.** 4B was tested and failed (Fabio, 2026-08-26).

| | Auto (default) | Manual |
|---|---|---|
| slot 1 | the clean scene | the scene **cropped to the box** |
| slot 2 | the **stamped composite** | the **clean object**, full frame |
| prompt | baked, hidden from the user | baked frame + the user's own words |
| orientation | the user's source photo | the model's choice, steered by the prompt |

**Two references, never three.** Three is the documented identity-mixing limit and it is what
made the model draw two guns.

## The rules these obey — do not "improve" a prompt without re-reading them

Measured live 2026-08-26 plus vendor guidance
([BFL](https://docs.bfl.ml/flux_2/flux2_image_editing),
[fal.ai](https://fal.ai/learn/devs/flux-2-klein-prompt-guide),
[deAPI](https://deapi.ai/blog/prompting-flux-2-klein-what-works-what-doesnt-and-why)):

- **40–120 words, target 60–90.** Over 100 confuses — a 200-word version returned a hugely
  oversized cup. Under 40 under-drives the Qwen3 encoder.
- **Positive phrasing.** The guides say prohibitions are ignored outright. MPI-567 has contrary
  *measured* evidence on this same model, so guards are not banned — they are simply not
  affordable until an actual failure earns one. Add them **one at a time, on evidence**;
  front-loading all six of Draw It In's guardrails is what broke scale.
- **Numbered image references** — the documented pattern, and dropping them cost a run.
- **No hedging modifiers.** Content nouns outweigh modifiers, so `approximately` / `roughly` /
  `near` fail to constrain *and* dilute. Two failures traced directly to this:
  `approximately the position and size` → giant cup; `near the position shown in image two` →
  the gun moved to the other end of the table.
- **Identity is free while the model is COPYING** — a reference keeps its own proportions and
  markings, so Auto spends no words on it. A licensed redraw is different, which is why Manual
  restates identity.
- **Instruction first, then describe the intended result** (BFL). Every prompt that *ordered* a
  rotation failed; the first one that *described a pose* moved the viewpoint immediately.

## Auto — the object's own pixels (DEFAULT)

The first prompt to pass the logo-on-a-mug case and the free-standing-cup case together.
Correct whenever the object's source photo is at a viewpoint the scene can use, which covered
every plate tested except the gun.

```
Place the object from image two into the scene of image one, at the position and size it has in image two. Rest it naturally on the surface it touches, at an angle that matches the camera in image one. Light it with the scene's own light, matching direction, colour temperature and contrast, with contact shading where it meets the surface and a shadow consistent with the shadows already in the scene. Keep everything else in image one unchanged.
```

## Manual — the region plus the clean object

For an object whose source viewpoint the scene cannot use. The user's own words carry the pose
and anything else the flow cannot know. Keep the baked frame **short** — the winning live run
was five words (`Place the gun on the table.`) with the clean object in slot 2, and the model
chose the angle correctly on its own.

```
Place the object from image two into the scene of image one. Light it with the scene's own light, matching direction, colour temperature and contrast, with contact shading where it meets the surface and a shadow consistent with the shadows already in the scene.
```

The user's text is appended. **Placeholder copy is load-bearing** — it is where the user learns
the move:

> `e.g. "lying flat on its side, barrel pointing left, seen from above"`

**The trade this mode makes, and the user must be told:** describing a pose licenses a redraw,
and a redraw is a re-render. The model has no 3D model of *that* object, so it synthesises a
generic one — a live run returned a beautifully lit pistol that was **not the user's Glock**.
Manual buys the viewpoint by spending the object's exact identity. Auto is the default for
exactly this reason.

## What was tried and does NOT work — do not re-attempt

| attempt | result |
|---|---|
| `adjust its angle to fit the scene` | identical flat product-shot viewpoint |
| `Redraw … seen from that scene's camera angle` | identical viewpoint |
| `Redraw … choose whatever angle, orientation and size` | identical viewpoint |
| a *specific pose described as content* | viewpoint moved immediately — **but the object changed** |

The first three failed for one structural reason: **the stamp is itself a picture of the object
at the wrong viewpoint, sitting in the conditioning, and no wording overrides a picture.** That
is why Manual drops the stamp rather than rewording anything.

## The user's prompt field

Optional, empty by default, shown only in Manual. It is the escape hatch for what the flow
cannot know and the user can see — above all **scene-specific lighting**
(*"warm sunlight from the left window"*), which the vendor guidance says to describe
photographically but a generic baked prompt can never name.

Declare it **on the step and nowhere else.** Restating it in the flow's `fields` so it is also
editable on the run slide silently drops edits from the second run onward — two different
stores, and `_collectInputs` applies the flow store last (MPI-620).

**A node titled `Input_Positive` gets an empty string injected whether or not the flow declares
the field**, so in Auto either leave the graph's prompt node untitled or bake it — an undeclared
`Input_Positive` is silently wiped every run (playbook § the `_buildParams` trap).
