# MPI-504 — Character Sheet flow: one supplied image in, a locked sheet out

Opened 2026-08-09. Fabio: *"I really want to do a character sheet one where the
user supplies one image and Flow creates a character sheet. I am thinking about
creating a character sheet just like they are explaining, where the full body
doesn't have a head."*

Three of the four shipped flows (`image-regen`, `sdxl-4k`, `video-stitch`) are
marked for deprecation; only `head-swap` follows through. This is the next real
flow.

## Not new on the board, but not a card either

**Character sheet creator is candidate workflow #4 in
[tasks/MPI-348/brief.md](../MPI-348/brief.md) §8** — *"the keystone"* — with
Fabio's own best-performing layout from past tests: *"one square image with face
SIDE profile, face FRONT profile, and a FULL BODY view. Should offer options
(view/scene count, single-square vs separate images) since a sheet also serves
users who DO want to train a LoRA."*

MPI-348's own working mode says *"ideas that surface mid-authoring become their
own cards rather than growing this one."* So this is that card. **MPI-348 keeps
the Krea2 bench track; MPI-504 owns the flow.** (Also mentioned in passing by
MPI-475 — H3 `ref2va` is *"the LoRA-free character bet: a character sheet in, a
consistent character out, no training"* — and MPI-478 uses a 2048px sheet as a
VRAM measurement case.)

## The layout conflict IS the first decision

Higgsfield's **HELL GRIND** production brief (95-minute AI feature, 15 people,
under $500K, 14 days of generation, screened at the 2026 Cannes Marché du Film)
specifies a different sheet — and, unusually, gives the failure each choice
fixes.

| | Fabio (MPI-348 §8.4) | Higgsfield brief |
|---|---|---|
| Panels | face **side** profile, face **front** profile, full body | face **close-up**, full body **front**, full body **back** |
| Portrait | front + side | one large **3/4** view (*"the sheets the model understands best"*), never straight-on |
| Front body | normal | **no head** |
| Layout | one square image, options for separate | three panels side by side |

Both are evidence-backed and they differ on every panel. **Settle it at the
bench before any UI.** Fabio's version additionally serves LoRA training, which
is why MPI-348 wanted view/scene-count and single-square-vs-separate as options.

### Why the front body is headless

> *"On wide shots the model kept taking the face from the small full-body figure
> on the sheet — where the face is tiny and blurry. Remove that head, and the
> model has only one place to take the face from: the close-up."*

Zero-cost, fixes a whole class of broken wides.

### The rest of their sheet spec

- **Keep the sheet boring on purpose.** Neutral grey background, flat light,
  real skin with visible pores, no retouch.
- **Do NOT bake film grain or cinematic lens character into the sheet** — *"the
  character will carry that look into every scene and stop reacting to new
  light."* The cinema look belongs in the location assets and the video prompts.
- **Always check the pupil catch-light**, even on dark eyes. *"Without it the
  face looks dead, and no video model can act with a dead face."*
- **Pick the most believable candidate face, never the most beautiful.** *"A
  'beautiful but fake' face will show its fakeness later, in video — when it is
  too late to fix."* Implies the flow should surface candidates rather than
  auto-pick.

## The real risk: our problem is harder than theirs

Higgsfield generated sheets **from a prompt** in Soul Cinema (a hosted creative
model), picking the best of several returns. Fabio's ask is **one supplied image
in** — reference-driven, not text-driven — and it must hold identity onto a
**back view the source photo never shows**.

Nothing on the board proves a local model does that. Per
[MPI-348 §7](../MPI-348/brief.md): Qwen-Edit is *"strongest at COMBINING images;
weak on single-image instruction edits"* — the wrong half for this. Krea2 is the
single-ref identity path (`ref_boost` ~4, §8.3). Boogu Image Edit is the
fallback.

**Prove the back-view step alone at the bench before any flow work.** If no
local path holds it, the flow ships front + 3/4 close-up only and says so
honestly rather than shipping a drifting third panel.

## The headless panel is a mask op, not a prompt

Do not ask a model to draw a headless body. Generate the front body normally,
then **SAM3-segment the head** ([docs/masking-sam3.md](../../../../docs/masking-sam3.md)
— `sam3.1_multiplex_fp16`, click-point or text branch) and remove it, letting
the backdrop fill. `klein-4b` has a real `inpaint` op, and Cubric Prompt's rules
already record that **Klein's removal path wants the prompt empty**.

This also honours the brief's hardest asset rule:

> *"An image never runs through a model twice in full. Every extra pass destroys
> texture and drifts colour — after two passes the face turns symmetrical,
> plastic and lifeless, and that dead texture later hurts the acting in video."*

Their point-change workflow (clothes, scars, blood) is the same shape: edit on
the sheet in an edit model, then composite back **through a mask** so the
original skin texture survives. `head-swap` already owns that machinery, and
MPI-348 §6 already picked the compositing paths (`ImageCompositeMasked` for
~1–1.5MP sources; `InpaintCropImproved`→`InpaintStitchImproved` for 4K/8K).

## Candidate pipeline (shortest thing that could work)

1. **3/4 close-up** — from the input image, relit flat onto neutral grey.
2. **Full body front** — single-ref identity path.
3. **Full body back** — same path. **The risky step; bench it first.**
4. **Head removal on panel 2** — SAM3 mask → inpaint with an empty prompt.
5. **Composite** — the panels onto one neutral-grey canvas.

Steps 1–3 are three *different panels*, not three passes over the same image, so
the never-twice rule is not violated. Step 4 is masked, which is the point.

## Definition of done includes the stress test

Not a nice-to-have — it is how they decided an asset was locked:

> *"Ten generations in different poses and different light. The character must be
> recognizable in ten out of ten. And not alone — next to the other assets, and
> in the light of the real scenes ahead. A hero who looks stable alone often
> breaks when he shares the frame with someone. If the test fails, the problem is
> your description, not the model."*

## Adjacent, same brief — separate cards if wanted

- **Location sheet flow.** Shoot 3/4, never frontal (*"a frontal pretty picture
  becomes flat wallpaper on wides, and past its edges the model invents new
  surroundings every time"*); leave an anchor object and tie staging to it; one
  light logic, never two suns. Their reverse-angle method, found late: **generate
  a video of the empty location with the camera walking slowly through it** — the
  video model draws the other sides consistently with the sheet — then screenshot
  the angle and texture-clean it. *"A full location sheet out of a single image."*
  Vision has every piece of that already.
- **Asset registry.** An asset is a **pair**: image + a **descriptor** that goes
  into every prompt *word for word, never shortened*. Every **state** is its own
  asset (`@roco`, `@roco_wet`, `@roco_blood`) because *"mix the states in one
  text, and the model starts mixing them between shots"*; locations split
  day/night/rain; props split by use. One tag dictionary across docs, prompts and
  UI. **This is the Vision↔Prompt seam** — the descriptor is exactly what Cubric
  Prompt would carry verbatim, and it is the subject of Prompt's MPI-28 §B.

## Sources

Full distillation: `~/.claude/memory/domain/ai-video-asset-production.md`.
Raw material saved 2026-08-09 to `C:\Users\Fabio\Downloads\seedance_skills\` —
`HELL GRIND project brief (extracted).txt` (the saved page is a 1.25MB SPA that
WebFetch cannot read; `extract-html-text.py` in the same folder strips it), plus
`CINEDANCE HIGGSFIELD SKILL.md`, `ACTING SKILL.md`, `LIRA SKILL.md` and the
`prompt-builder-2-5.skill` zip.

The recipe/enhancer half of the same brief is **Cubric Prompt's MPI-28**.
